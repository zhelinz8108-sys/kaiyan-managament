export function ensureValidRange(startAt: Date, endAt: Date) {
  if (!(startAt instanceof Date) || Number.isNaN(startAt.getTime())) {
    throw new Error("invalid startAt");
  }

  if (!(endAt instanceof Date) || Number.isNaN(endAt.getTime())) {
    throw new Error("invalid endAt");
  }

  if (startAt >= endAt) {
    throw new Error("startAt must be earlier than endAt");
  }
}

export function parseBusinessDate(value: string): { start: Date; end: Date } {
  const start = new Date(`${value}T00:00:00`);
  const end = new Date(`${value}T23:59:59.999`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("invalid biz_date");
  }

  return { start, end };
}
