import Link from "next/link";
import { getCurrentAppUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

function maskKey(value?: string | null) {
  if (!value) return "No API key saved";
  if (value.length <= 8) return "Saved";
  return `${value.slice(0, 4)}••••••${value.slice(-4)}`;
}

export default async function SettingsPage() {
  const user = await getCurrentAppUser();

  const syncState = user
    ? await prisma.syncState.findUnique({
        where: {
          userId: user.id,
        },
      })
    : null;

  return (
    <main className="min-h-screen bg-zinc-950 p-10 text-white">
      <div className="mb-8 flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Configure the Torn API key and standard sync settings for this player.
          </p>
        </div>

        <Link
          href="/"
          className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-semibold hover:bg-zinc-900"
        >
          Dashboard
        </Link>
      </div>

      <div className="mb-8 rounded-xl bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold">Current Player</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-zinc-400">Player Name</p>
            <p className="mt-1 font-semibold">{user?.playerName ?? "Not configured"}</p>
          </div>

          <div>
            <p className="text-sm text-zinc-400">Torn Player ID</p>
            <p className="mt-1 font-semibold">{user?.tornPlayerId ?? "-"}</p>
          </div>

          <div>
            <p className="text-sm text-zinc-400">API Key</p>
            <p className="mt-1 font-semibold">{maskKey(user?.apiKey)}</p>
          </div>
        </div>
      </div>

      <form
        action="/settings/save"
        method="POST"
        className="mb-8 rounded-xl bg-zinc-900 p-6"
      >
        <h2 className="text-xl font-semibold">Player Configuration</h2>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm text-zinc-400">
              Torn API Key
            </label>
            <input
              type="password"
              name="apiKey"
              placeholder="Paste Torn API key"
              className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white"
            />
            <p className="mt-2 text-xs text-zinc-500">
              Leave blank to keep the saved key.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Initial backfill days
            </label>
            <input
              type="number"
              name="defaultBackfillDays"
              defaultValue={user?.defaultBackfillDays ?? 30}
              min={1}
              max={365}
              className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              API delay milliseconds
            </label>
            <input
              type="number"
              name="defaultDelayMs"
              defaultValue={user?.defaultDelayMs ?? 2500}
              min={1000}
              step={500}
              className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-zinc-400">
              Backfill pages per log type
            </label>
            <input
              type="number"
              name="defaultBackfillPages"
              defaultValue={user?.defaultBackfillPages ?? 25}
              min={1}
              max={100}
              className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white"
            />
          </div>
        </div>

        <button
          type="submit"
          className="mt-6 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold hover:bg-emerald-500"
        >
          Save Settings
        </button>
      </form>

      <div className="rounded-xl bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold">Initial Backfill</h2>

        <p className="mt-2 text-sm text-zinc-400">
          Standard initial backfill is 30 days. Once complete, the data is stored
          in the database and does not need to be repeated.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-sm text-zinc-400">Backfill Status</p>
            <p className="mt-1 font-semibold">
              {syncState?.backfillComplete ? "Complete" : "Not Complete"}
            </p>
          </div>

          <div>
            <p className="text-sm text-zinc-400">Loaded From</p>
            <p className="mt-1 font-semibold">
              {syncState?.backfillFromDate
                ? syncState.backfillFromDate.toISOString().slice(0, 10)
                : "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-zinc-400">Loaded To</p>
            <p className="mt-1 font-semibold">
              {syncState?.backfillToDate
                ? syncState.backfillToDate.toISOString().slice(0, 10)
                : "-"}
            </p>
          </div>
        </div>

        {user?.apiKey && !syncState?.backfillComplete && (
          <Link
            href={`/backfill?days=${user.defaultBackfillDays}&pages=${user.defaultBackfillPages}&delayMs=${user.defaultDelayMs}`}
            className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold hover:bg-blue-500"
          >
            Run Initial {user.defaultBackfillDays}-Day Backfill
          </Link>
        )}
      </div>
    </main>
  );
}