import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertUser, HttpError, isOfficeManager } from "@/lib/auth";
import { handleRouteError } from "@/lib/http";
import { assertOfficeMember, assertRoomAccess } from "@/lib/office-access";
import { rateLimit } from "@/lib/rate-limit";
import { publishServer } from "@/lib/realtime/ably-server";
import { ch } from "@/lib/realtime/channels";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Booking } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const MAX_HOURS = 8;

function toBooking(r: Record<string, unknown>, names: Map<string, string>): Booking {
  return {
    id: r.id as string,
    roomId: r.room_id as string,
    title: r.title as string,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    createdBy: r.created_by as string,
    createdByName: names.get(r.created_by as string) ?? "Alguém",
    attendees: (r.attendees as string[] | null) ?? [],
  };
}

/** Reservas das próximas 2 semanas (e as que ainda estão acontecendo) + membros do escritório. */
export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const officeId = z.uuid().parse(req.nextUrl.searchParams.get("officeId"));
    await assertOfficeMember(supabase, officeId, user.id);
    const admin = supabaseAdmin();
    const now = Date.now();
    const [{ data: rows, error }, { data: members }] = await Promise.all([
      admin
        .from("room_bookings")
        .select("*")
        .eq("office_id", officeId)
        .gt("ends_at", new Date(now - 60 * 60_000).toISOString())
        .lt("starts_at", new Date(now + 15 * 24 * 60 * 60_000).toISOString())
        .order("starts_at"),
      admin.from("office_members").select("user_id").eq("office_id", officeId).eq("banned", false),
    ]);
    if (error) throw error;
    const ids = (members ?? []).map((m) => m.user_id as string);
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id, display_name").in("id", ids)
      : { data: [] as { id: string; display_name: string }[] };
    const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
    return NextResponse.json(
      {
        bookings: (rows ?? []).map((r) => toBooking(r, names)),
        members: ids
          .map((id) => ({ id, name: names.get(id) ?? "Alguém" }))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
        serverNow: now,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return handleRouteError(e);
  }
}

const createBody = z.object({
  officeId: z.uuid(),
  roomId: z.uuid(),
  title: z.string().trim().min(1, "Dê um nome para a reunião").max(80),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  attendees: z.array(z.uuid()).max(50).default([]),
});

/** Cria uma reserva (não pode bater com outra na mesma sala). */
export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const rl = rateLimit(`booking:${user.id}`, 10, 60_000);
    if (!rl.ok) throw new HttpError(429, "Calma! Tente de novo em instantes.");
    const input = createBody.parse(await req.json());
    await assertOfficeMember(supabase, input.officeId, user.id);
    await assertRoomAccess(supabase, input.officeId, input.roomId);

    const start = new Date(input.startsAt).getTime();
    const end = new Date(input.endsAt).getTime();
    if (!(end > start)) throw new HttpError(400, "O fim precisa ser depois do início.");
    if (end - start > MAX_HOURS * 60 * 60_000) throw new HttpError(400, `Uma reserva pode durar no máximo ${MAX_HOURS} horas.`);
    if (end < Date.now()) throw new HttpError(400, "Esse horário já passou.");
    if (start > Date.now() + 90 * 24 * 60 * 60_000) throw new HttpError(400, "Reserve com até 90 dias de antecedência.");

    const admin = supabaseAdmin();
    const { data: clash } = await admin
      .from("room_bookings")
      .select("title, starts_at, ends_at")
      .eq("room_id", input.roomId)
      .lt("starts_at", new Date(end).toISOString())
      .gt("ends_at", new Date(start).toISOString())
      .limit(1);
    if (clash?.length) throw new HttpError(409, `Essa sala já está reservada nesse horário (“${clash[0].title}”).`);

    // Só membros do escritório podem ser convidados.
    const wanted = Array.from(new Set(input.attendees.filter((id) => id !== user.id)));
    let attendees: string[] = [];
    if (wanted.length) {
      const { data: ok } = await admin
        .from("office_members")
        .select("user_id")
        .eq("office_id", input.officeId)
        .eq("banned", false)
        .in("user_id", wanted);
      attendees = (ok ?? []).map((m) => m.user_id as string);
    }

    const { error } = await admin.from("room_bookings").insert({
      office_id: input.officeId,
      room_id: input.roomId,
      title: input.title,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      created_by: user.id,
      attendees,
    });
    if (error) throw error;
    await publishServer(ch.control(input.officeId), "control", { type: "bookings-updated" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}

const deleteBody = z.object({ officeId: z.uuid(), id: z.uuid() });

/** Cancela uma reserva (quem criou ou um gestor do escritório). */
export async function DELETE(req: NextRequest) {
  try {
    const { user, supabase } = await assertUser();
    const input = deleteBody.parse(await req.json());
    await assertOfficeMember(supabase, input.officeId, user.id);
    const admin = supabaseAdmin();
    const { data: row } = await admin
      .from("room_bookings")
      .select("created_by, office_id")
      .eq("id", input.id)
      .maybeSingle();
    if (!row || row.office_id !== input.officeId) throw new HttpError(404, "Reserva não encontrada.");
    if (row.created_by !== user.id && !(await isOfficeManager(supabase, input.officeId))) {
      throw new HttpError(403, "Só quem criou a reserva pode cancelar.");
    }
    const { error } = await admin.from("room_bookings").delete().eq("id", input.id);
    if (error) throw error;
    await publishServer(ch.control(input.officeId), "control", { type: "bookings-updated" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
