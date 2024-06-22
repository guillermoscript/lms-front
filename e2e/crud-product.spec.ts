import { test } from "@playwright/test";

import { loginAdmin } from "./components/login-admin";
import { url } from "./utils/url";

test("crud product", async ({ page }) => {
  await page.goto(url);

  await loginAdmin(page);

  // TODO: Crear 1 product
  // TODO: 1.1

  // TODO: Crear 3 product

  // TODO: View list product

  // TODO: Edit first product

  // TODO: Delete first product

  // TODO: Delete all product
});
