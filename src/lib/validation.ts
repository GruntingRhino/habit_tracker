import { z } from "zod";

export function strictObject<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject(shape);
}

export const trimmedString = (max: number, min = 0) =>
  z.string().trim().min(min).max(max);

export const optionalTrimmedString = (max: number, min = 0) =>
  trimmedString(max, min).optional();
