"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiAssistedStrategy = exports.formDetectionStrategy = exports.visualProximityStrategy = exports.tabOrderStrategy = void 0;
exports.executeAuthStrategies = executeAuthStrategies;
exports.tabOrderStrategy = {
    name: 'Tab Order Navigation',
    async execute(page, email, password, debug) {
        try {
            if (debug)
                console.log('  🔄 Using Tab Order Strategy...');
            await page.click('body');
            await page.keyboard.press('Tab');
            await page.waitForTimeout(100);
            await page.keyboard.type(email);
            if (debug)
                console.log('  ✅ Typed email in first field');
            await page.keyboard.press('Tab');
            await page.waitForTimeout(100);
            await page.keyboard.type(password);
            if (debug)
                console.log('  ✅ Typed password in second field');
            await page.keyboard.press('Tab');
            await page.waitForTimeout(100);
            await page.keyboard.press('Enter');
            if (debug)
                console.log('  ✅ Pressed Enter on submit button');
            return true;
        }
        catch (error) {
            if (debug)
                console.log(`  ❌ Tab order strategy failed: ${error}`);
            return false;
        }
    }
};
exports.visualProximityStrategy = {
    name: 'Visual Proximity',
    async execute(page, email, password, debug) {
        try {
            if (debug)
                console.log('  🔄 Using Visual Proximity Strategy...');
            const inputs = await page.evaluate(() => {
                const allInputs = Array.from(document.querySelectorAll('input'));
                return allInputs
                    .filter(input => input.offsetParent !== null)
                    .map(input => ({
                    type: input.type,
                    top: input.getBoundingClientRect().top,
                    left: input.getBoundingClientRect().left,
                    width: input.getBoundingClientRect().width,
                    height: input.getBoundingClientRect().height
                }))
                    .sort((a, b) => a.top - b.top);
            });
            if (inputs.length < 2) {
                throw new Error('Not enough input fields found');
            }
            const emailInput = await page.locator('input').nth(0);
            await emailInput.fill(email);
            if (debug)
                console.log('  ✅ Filled top-most input with email');
            const passwordInputs = inputs.filter(i => i.type === 'password');
            if (passwordInputs.length > 0) {
                const passwordInput = await page.locator('input[type="password"]').first();
                await passwordInput.fill(password);
                if (debug)
                    console.log('  ✅ Filled password input');
            }
            else {
                const passwordInput = await page.locator('input').nth(1);
                await passwordInput.fill(password);
                if (debug)
                    console.log('  ✅ Filled second input with password');
            }
            const submitButton = await page.evaluate(() => {
                const inputs = document.querySelectorAll('input');
                const lastInput = inputs[inputs.length - 1];
                if (!lastInput)
                    return null;
                const inputRect = lastInput.getBoundingClientRect();
                const buttons = Array.from(document.querySelectorAll('button'));
                const nearbyButtons = buttons.filter(btn => {
                    const btnRect = btn.getBoundingClientRect();
                    return btnRect.top > inputRect.top &&
                        Math.abs(btnRect.left - inputRect.left) < 200;
                });
                if (nearbyButtons.length > 0) {
                    nearbyButtons[0].click();
                    return true;
                }
                return false;
            });
            if (!submitButton) {
                await page.locator('input[type="password"]').press('Enter');
                if (debug)
                    console.log('  ⚠️ No submit button found, pressed Enter');
            }
            return true;
        }
        catch (error) {
            if (debug)
                console.log(`  ❌ Visual proximity strategy failed: ${error}`);
            return false;
        }
    }
};
exports.formDetectionStrategy = {
    name: 'Form Detection',
    async execute(page, email, password, debug) {
        try {
            if (debug)
                console.log('  🔄 Using Form Detection Strategy...');
            const formData = await page.evaluate(() => {
                const forms = Array.from(document.querySelectorAll('form'));
                for (const form of forms) {
                    const passwordInput = form.querySelector('input[type="password"]');
                    if (passwordInput) {
                        const allInputs = Array.from(form.querySelectorAll('input'));
                        const textInputs = allInputs.filter(i => i.type === 'text' || i.type === 'email' || !i.type);
                        return {
                            hasForm: true,
                            textInputIndex: textInputs.length > 0 ? allInputs.indexOf(textInputs[0]) : -1,
                            passwordInputIndex: allInputs.indexOf(passwordInput),
                            formIndex: Array.from(document.querySelectorAll('form')).indexOf(form)
                        };
                    }
                }
                return { hasForm: false };
            });
            if (!formData.hasForm) {
                throw new Error('No form with password field found');
            }
            const form = await page.locator('form').nth(formData.formIndex);
            if (formData.textInputIndex >= 0) {
                const emailInput = await form.locator('input').nth(formData.textInputIndex);
                await emailInput.fill(email);
                if (debug)
                    console.log('  ✅ Filled email in form');
            }
            const passwordInput = await form.locator('input[type="password"]').first();
            await passwordInput.fill(password);
            if (debug)
                console.log('  ✅ Filled password in form');
            await form.evaluate(form => {
                form.submit();
            });
            if (debug)
                console.log('  ✅ Submitted form');
            return true;
        }
        catch (error) {
            if (debug)
                console.log(`  ❌ Form detection strategy failed: ${error}`);
            return false;
        }
    }
};
exports.aiAssistedStrategy = {
    name: 'AI-Assisted',
    async execute(page, email, password, debug) {
        try {
            if (debug)
                console.log('  🔄 Using AI-Assisted Strategy...');
            const screenshot = await page.screenshot({ fullPage: false });
            const pageInfo = await page.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input')).map((input, i) => ({
                    index: i,
                    type: input.type,
                    placeholder: input.placeholder,
                    visible: input.offsetParent !== null,
                    position: input.getBoundingClientRect()
                }));
                const buttons = Array.from(document.querySelectorAll('button')).map((btn, i) => ({
                    index: i,
                    text: btn.textContent?.trim(),
                    visible: btn.offsetParent !== null,
                    position: btn.getBoundingClientRect()
                }));
                return { inputs, buttons };
            });
            if (pageInfo.inputs.length >= 2) {
                const nonPasswordInputs = pageInfo.inputs.filter(i => i.type !== 'password' && i.visible);
                if (nonPasswordInputs.length > 0) {
                    await page.locator('input').nth(nonPasswordInputs[0].index).fill(email);
                }
                const passwordInput = pageInfo.inputs.find(i => i.type === 'password' && i.visible);
                if (passwordInput) {
                    await page.locator('input').nth(passwordInput.index).fill(password);
                }
                const submitButton = pageInfo.buttons.find(b => b.visible &&
                    (b.text?.toLowerCase().includes('log') ||
                        b.text?.toLowerCase().includes('sign') ||
                        b.text?.toLowerCase().includes('submit')));
                if (submitButton) {
                    await page.locator('button').nth(submitButton.index).click();
                }
                else {
                    await page.keyboard.press('Enter');
                }
                return true;
            }
            return false;
        }
        catch (error) {
            if (debug)
                console.log(`  ❌ AI-assisted strategy failed: ${error}`);
            return false;
        }
    }
};
async function executeAuthStrategies(page, email, password, debug) {
    const strategies = [
        exports.tabOrderStrategy,
        exports.visualProximityStrategy,
        exports.formDetectionStrategy,
        exports.aiAssistedStrategy
    ];
    for (const strategy of strategies) {
        if (debug)
            console.log(`\n🎯 Trying ${strategy.name}...`);
        try {
            const success = await strategy.execute(page, email, password, debug);
            if (success) {
                try {
                    await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 5000 });
                }
                catch {
                    await page.waitForTimeout(2000);
                }
                const url = page.url();
                const onLoginPage = url.includes('/login') || url.includes('/signin') || url.includes('/auth');
                if (!onLoginPage) {
                    if (debug)
                        console.log(`  ✅ ${strategy.name} succeeded!`);
                    return true;
                }
                else {
                    if (debug)
                        console.log(`  ⚠️ ${strategy.name} executed but still on login page`);
                }
            }
        }
        catch (error) {
            if (debug)
                console.log(`  ❌ ${strategy.name} error: ${error}`);
        }
    }
    return false;
}
