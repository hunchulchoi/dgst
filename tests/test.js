import { expect, test } from '@playwright/test';
import bcrypt from "bcrypt";

test('index page has expected h1', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Welcome to SvelteKit' })).toBeVisible();
});


test('bcrypt test', async ({ page }) => {
	//await page.goto('/');
	//await expect(page.getByRole('heading', { name: 'Welcome to SvelteKit' })).toBeVisible();
	
	for(let i=0; i<10; i++){
		console.log(bcrypt.hashSync('waitandpreparation@gmail.com', bcrypt.genSaltSync(12)));
	}
});
