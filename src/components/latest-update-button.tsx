"use client";

import { useState } from "react";

export default function LatestUpdateButton() {
    const [loading, setLoading] = useState(false);

    async function handleUpdate() {
        try {
            setLoading(true);

            await fetch("/test-api");

            // refresh the page after update
            window.location.reload();
        } catch (err) {
            console.error("Update failed", err);
        } finally {
            setLoading(false);
        }
    }

    return (
        <button
            onClick={handleUpdate}
            disabled={loading}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-50"
        >
            {loading ? "Updating..." : "Latest Update"}
        </button>
    );
}