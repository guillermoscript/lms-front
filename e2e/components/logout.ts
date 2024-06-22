import { Page } from "@playwright/test";

export const loginOut = async (page: Page) => {
  await page.getByRole("button", { name: "Avatar Toggle user menu" }).click();
  await page.getByRole("button", { name: "Logout" }).click();
};
