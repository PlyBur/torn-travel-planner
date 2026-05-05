"use client";

import { useEffect, useState } from "react";

function getAgeText(date?: string | Date | null) {
    if (!date) return "Never updated";

    const d = typeof date === "string" ? new Date(date) : date;
    const diff = Date.now() - d.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return `${seconds}s ago`;
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

export default function LatestUpdateAge({
    lastUpdated,
}: {
    lastUpdated?: string | Date | null;
}) {
    const [text, setText] = useState(getAgeText(lastUpdated));

    useEffect(() => {
        const interval = setInterval(() => {
            setText(getAgeText(lastUpdated));
        }, 1000);

        return () => clearInterval(interval);
    }, [lastUpdated]);

    return <span>{text}</span>;
}