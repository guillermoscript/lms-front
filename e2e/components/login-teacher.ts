import { Page } from "@playwright/test";

import { creds } from "../utils/creds";

export const loginTeacher = async (page: Page) => {
  await page.getByPlaceholder("you@example.com").fill(creds.teacher.email);
  await page.getByPlaceholder("••••••••").fill(creds.teacher.pass);
  await page.getByRole("button", { name: "Login" }).click();
};
