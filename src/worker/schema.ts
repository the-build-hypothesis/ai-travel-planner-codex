import { z } from "zod";
export const ActivitySchema = z.object({
  id: z.string().min(1).max(100),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  title: z.string().min(1).max(200),
  description: z.string().max(1500),
  location: z.string().max(300),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  duration: z.number().int().min(15).max(720),
  cost: z.number().min(0).max(1000000).nullable(),
  category: z.enum([
    "culture",
    "food",
    "nature",
    "adventure",
    "relax",
    "transport",
  ]),
  transport: z.string().max(500),
});
export const DaySchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(200),
  summary: z.string().max(1000),
  activities: z.array(ActivitySchema).max(12),
});
export const DaysSchema = z
  .array(DaySchema)
  .max(30)
  .superRefine((days, ctx) => {
    const ids = new Set<string>();
    for (const day of days) {
      if (ids.has(day.id))
        ctx.addIssue({ code: "custom", message: "Duplicate day ID" });
      ids.add(day.id);
      let end = 0;
      for (const a of day.activities) {
        if (ids.has(a.id))
          ctx.addIssue({ code: "custom", message: "Duplicate activity ID" });
        ids.add(a.id);
        const [h, m] = a.time.split(":").map(Number);
        const start = h * 60 + m;
        if (start < end)
          ctx.addIssue({ code: "custom", message: "Overlapping activities" });
        end = start + a.duration;
        if (end > 1440)
          ctx.addIssue({
            code: "custom",
            message: "Activity ends after midnight",
          });
        if ((a.lat === null) !== (a.lng === null))
          ctx.addIssue({
            code: "custom",
            message: "Coordinates must be a pair",
          });
      }
    }
  });
export const PreferencesSchema = z.object({
  startDate: z
    .string()
    .max(10)
    .refine(
      (v) =>
        v === "" ||
        (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
          !Number.isNaN(Date.parse(v)) &&
          new Date(v).toISOString().slice(0, 10) === v),
      "Enter a valid date",
    )
    .default(""),
  days: z.number().int().min(1).max(30).default(5),
  travelers: z.number().int().min(1).max(30).default(2),
  children: z.array(z.number().int().min(0).max(17)).max(20).default([]),
  budget: z.number().min(0).max(10000000).nullable().default(null),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("USD"),
  pace: z.enum(["relaxed", "balanced", "packed"]).default("balanced"),
  interests: z.string().max(2000).default(""),
  requirements: z.string().max(2000).default(""),
});
export const TripInput = z.object({
  title: z.string().trim().min(1).max(120),
  destination: z.string().trim().max(200).default(""),
  preferences: PreferencesSchema.default(() => PreferencesSchema.parse({})),
});
export const AIResult = z.object({
  message: z.string().min(1).max(6000),
  title: z.string().max(120),
  destination: z.string().max(200),
  days: DaysSchema,
});
export const AIJsonSchema = z.toJSONSchema(
  z.object({
    message: z.string(),
    title: z.string(),
    destination: z.string(),
    days: z.array(DaySchema),
  }),
  { target: "draft-7" },
);
export type Day = z.infer<typeof DaySchema>;
export type Activity = z.infer<typeof ActivitySchema>;
