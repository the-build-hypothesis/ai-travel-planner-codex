import { test, expect } from "@playwright/test";
test("Discover renders and navigation works without horizontal overflow", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /A little wonder/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Where is your curiosity taking you?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Kyoto/ })).toBeVisible();
  await page.screenshot({
    path: `evidence/discover-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: /My trips/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your journeys, all together." }),
  ).toBeVisible();
});
test("Guest can create, manually edit, map and reopen a trip", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Let’s plan a trip" }).click();
  await page.getByLabel("Where to?").fill("Kyoto");
  await page.getByLabel("Days", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Create my trip", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A journey to Kyoto" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Or start planning by hand" }).click();
  await expect(
    page.getByRole("heading", { name: "A day to explore" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add a little something" }).click();
  await page
    .getByLabel("Activity", { exact: true })
    .fill("A quiet temple walk");
  await page.getByLabel("Location", { exact: true }).fill("Kyoto, Japan");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Take your time exploring the neighborhood.");
  await page.getByLabel("Latitude", { exact: true }).fill("35.0116");
  await page.getByLabel("Longitude", { exact: true }).fill("135.7681");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(
    page.getByRole("heading", { name: "A quiet temple walk" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "A quiet temple walk" }),
  ).toBeVisible();
  await page.screenshot({
    path: `evidence/itinerary-${testInfo.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".map-marker")).toHaveCount(1);
  await page.locator(".map-marker").click();
  await expect(page.locator(".leaflet-popup-content")).toContainText(
    "A quiet temple walk",
  );
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible({
    timeout: 15000,
  });
  await page.screenshot({
    path: `evidence/map-${testInfo.project.name}.png`,
    fullPage: true,
  });
  const secondDaySaved = await page.evaluate(async () => {
    const tripId = new URL(location.href).searchParams.get("trip");
    const { trip } = await (await fetch("/api/trips/" + tripId)).json();
    const day = {
      id: crypto.randomUUID(),
      title: "A second look",
      summary: "A garden afternoon.",
      activities: [
        {
          ...trip.itinerary[0].activities[0],
          id: crypto.randomUUID(),
          title: "A garden afternoon",
          lat: 35.02,
          lng: 135.78,
        },
      ],
    };
    return (
      await fetch("/api/trips/" + tripId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          version: trip.version,
          itinerary: [...trip.itinerary, day],
        }),
      })
    ).ok;
  });
  expect(secondDaySaved).toBe(true);
  await page.reload();
  await page.getByRole("button", { name: "Day 2", exact: true }).click();
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect(page.locator(".map-marker")).toHaveCount(1);
  await page.locator(".map-marker").click();
  await expect(page.locator(".leaflet-popup-content")).toContainText("Day 2");
  await page.getByRole("button", { name: "Day 1", exact: true }).click();
  await page.getByRole("button", { name: "Itinerary", exact: true }).click();
  await page.getByRole("button", { name: "Edit A quiet temple walk" }).click();
  await page
    .getByLabel("Activity", { exact: true })
    .fill("An even quieter temple walk");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(
    page.getByRole("heading", { name: "An even quieter temple walk" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Add a little something" }).click();
  await page.getByLabel("Activity", { exact: true }).fill("Afternoon tea");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Overlapping activities",
  );
  await expect(page.getByLabel("Activity", { exact: true })).toHaveValue(
    "Afternoon tea",
  );
  await page.getByLabel("Start time", { exact: true }).fill("11:00");
  await page.getByRole("button", { name: "Save activity" }).click();
  await expect(
    page.getByRole("heading", { name: "Afternoon tea" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move Afternoon tea up", exact: true })
    .click();
  await expect(page.locator(".activity-card h3").first()).toHaveText(
    "Afternoon tea",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Remove Afternoon tea", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Afternoon tea" }),
  ).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete trip", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your journeys, all together." }),
  ).toBeVisible();
});
test("Account login and recovery screens expose correct controls", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await expect(
    page.getByRole("button", { name: "Request reset link" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to log in" }).click();
  await page.getByRole("button", { name: "Create an account" }).click();
  await expect(page.getByLabel("Your name")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
test("Admin is a separate protected login", async ({ page }, testInfo) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Behind the journeys." }),
  ).toBeVisible();
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByText("Travelers · lifetime")).toHaveCount(0);
  await page.screenshot({
    path: `evidence/admin-login-${testInfo.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
