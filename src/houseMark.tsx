const houses: Record<string, { color: string }> = {
  diwan: { color: "#4a2c14" },
  nakheel: { color: "#245c45" },
  bait: { color: "#164e63" },
  sufra: { color: "#9a3412" },
  wahah: { color: "#8a6412" },
  reef: { color: "#7f1d1d" },
};

export function houseColor(id: string) {
  return houses[id]?.color ?? "#633a11";
}

export function RestaurantMark({ id, name }: { id: string; name: string }) {
  return (
    <span className="house-mark" style={{ background: houseColor(id) }} aria-hidden="true">
      <Mark id={id} name={name} />
    </span>
  );
}

function Mark({ id, name }: { id: string; name: string }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (id === "diwan") {
    return (
      <svg viewBox="0 0 32 32">
        <path d="M8 26V14.5C8 9.8 11.6 6 16 6s8 3.8 8 8.5V26" {...stroke} />
        <path d="M13 26v-6.2a3 3 0 0 1 6 0V26" {...stroke} />
      </svg>
    );
  }
  if (id === "nakheel") {
    return (
      <svg viewBox="0 0 32 32">
        <path d="M16 28V14" {...stroke} />
        <path d="M16 16c-5.2-1.2-8-5.4-8-9 4.2.2 7.2 2.4 8 5.2C16.8 9.4 19.8 7.2 24 7c0 3.6-2.8 7.8-8 9z" {...stroke} />
        <path d="M16 15.5c-3.4 2.2-5.2 5.6-5.2 8.8M16 15.5c3.4 2.2 5.2 5.6 5.2 8.8" {...stroke} />
      </svg>
    );
  }
  if (id === "bait") {
    return (
      <svg viewBox="0 0 32 32">
        <path fill="currentColor" d="M6 16c4-4.6 8.4-6.6 13.2-6.6 1.6 0 3.1.3 4.4.9L28 7.6v6.4L24.2 16 28 18v6.4l-4.4-2.7c-1.3.6-2.8.9-4.4.9C14.4 22.6 10 20.6 6 16z" />
        <circle cx="13.2" cy="15.1" r="1.15" fill="#164e63" />
      </svg>
    );
  }
  if (id === "sufra") {
    return (
      <svg viewBox="0 0 32 32">
        <path d="M12 18c0-3.2 1.8-6 4-8 2.2 2 4 4.8 4 8" {...stroke} />
        <path d="M16 8c.8 2.2.8 4 0 6" {...stroke} />
        <path d="M7 22h18M9 25.5h14" {...stroke} />
      </svg>
    );
  }
  if (id === "wahah") {
    return (
      <svg viewBox="0 0 32 32">
        <circle cx="16" cy="11.5" r="3.1" fill="currentColor" />
        <path d="M16 5.2v1.8M16 16v1.8M10.4 6.6l1.3 1.3M20.3 15.1l1.3 1.3M10.4 16.4l1.3-1.3M20.3 7.9l1.3-1.3" {...stroke} />
        <path d="M7 25c2.2-1.8 4.2-1.8 6.4 0s4.2 1.8 6.4 0 4.2-1.8 6.4 0" {...stroke} />
      </svg>
    );
  }
  if (id === "reef") {
    return (
      <svg viewBox="0 0 32 32">
        <path d="M4 22 12 12l5 7 4-5 7 8" {...stroke} />
        <path d="M4 25.5h24" {...stroke} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32">
      <text x="16" y="21" textAnchor="middle" fill="currentColor" fontSize="14" fontWeight="700">
        {name.trim().slice(0, 1)}
      </text>
    </svg>
  );
}
