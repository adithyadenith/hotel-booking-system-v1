import { expect, test } from "@playwright/test"

async function login(page: any, type: "admin" | "staff", email: string) {
  await page.goto("/login")
  await page.getByRole("button", { name: type === "admin" ? "Administrator" : "Hotel staff" }).click()
  await page.getByLabel("Email address").fill(email)
  await page.locator('input[type="password"]').fill("Demo@12345")
  await page.getByRole("button", { name: /Sign in as/ }).click()
}

async function openMenuIfNeeded(page: any) {
  const menu = page.getByRole("button", { name: "Open navigation menu" })
  if (await menu.isVisible()) await menu.click()
}

test("administrator can open setup and connections", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop navigation workflow; mobile navigation is covered separately.")
  await login(page, "admin", "admin@demo.lk")
  await expect(page).toHaveURL(/dashboard/)
  await openMenuIfNeeded(page)
  await page.getByRole("link", { name: "Hotel setup" }).click()
  await expect(page.getByRole("heading", { name: /Hotel setup/i })).toBeVisible()
  await page.getByRole("link", { name: "Connections" }).click()
  await expect(page.getByRole("link", { name: "Website booking" })).toBeVisible()
})

test("receptionist is sent to daily hotel work and cannot access setup", async ({ page }) => {
  await login(page, "staff", "reception@demo.lk")
  await expect(page).toHaveURL(/operations/)
  await page.goto("/setup")
  await expect(page).toHaveURL(/operations/)
  await expect(page.getByRole("heading", { name: /Manage today/i })).toBeVisible()
})

test("housekeeping user only sees room-cleaning work", async ({ page }) => {
  await login(page, "staff", "clean@demo.lk")
  await expect(page).toHaveURL(/housekeeping/)
  await expect(page.getByRole("heading", { name: "Room cleaning" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Bookings" })).toHaveCount(0)
})

test("split-window navigation keeps menu labels and header actions visible", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 820 })
  await login(page, "admin", "admin@demo.lk")
  await expect(page.getByRole("link", { name: "Bookings" })).toBeVisible()
  await expect(page.getByPlaceholder("Search bookings, guests, rooms...")).toBeVisible()
  await expect(page.getByLabel("Notifications")).toBeVisible()
})
