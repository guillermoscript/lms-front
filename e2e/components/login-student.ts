import { Page } from "@playwright/test";

import { creds } from "../utils/creds";

export const loginStudent = async (page: Page) => {
  await page.getByPlaceholder("you@example.com").fill(creds.student.email);
  await page.getByPlaceholder("••••••••").fill(creds.student.pass);
  await page.getByRole("button", { name: "Login" }).click();
};
