"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiAssistedStrategy = exports.formDetectionStrategy = exports.visualProximityStrategy = exports.tabOrderStrategy = void 0;
exports.executeAuthStrategies = executeAuthStrategies;
const core_1 = require("../core");
exports.tabOrderStrategy = {
    name: 'Tab Order Navigation',
    async execute(page, email, password, debug) {
        const logger = (0, core_1.createModuleLogger)({
            module: 'AuthStrategy.TabOrder',
            debug,
            defaultCategory: core_1.ErrorCategory.AUTHENTICATION
        });
        try {
            logger.debug('  🔄 Using Tab Order Strategy...');
            await page.click('body');
            await page.keyboard.press('Tab');
            await page.waitForTimeout(100);
            await page.keyboard.type(email);
            logger.debug('  ✅ Typed email in first field');
            await page.keyboard.press('Tab');
            await page.waitForTimeout(100);
            await page.keyboard.type(password);
            logger.debug('  ✅ Typed password in second field');
            for (let i = 0; i < 5; i++) {
                await page.keyboard.press('Tab');
                await page.waitForTimeout(50);
            }
            logger.debug('  ✅ Pressed Enter on submit button');
            return true;
        }
        catch (error) {
            await logger.error(error, {
                userAction: 'Tab order authentication strategy',
                severity: core_1.ErrorSeverity.MEDIUM,
                metadata: { strategy: 'tabOrder' }
            });
            return false;
        }
    }
};
exports.visualProximityStrategy = {
    name: 'Visual Proximity',
    async execute(page, email, password, debug) {
        const logger = (0, core_1.createModuleLogger)({
            module: 'AuthStrategy.VisualProximity',
            debug,
            defaultCategory: core_1.ErrorCategory.AUTHENTICATION
        });
        try {
            logger.debug('  🔄 Using Visual Proximity Strategy...');
            const textInputs = await page.locator('input[type="text"], input[type="email"], input:not([type])').all();
            if (textInputs.length === 0) {
                throw new Error('No text inputs found');
            }
            const inputsWithPosition = await Promise.all(textInputs.map(async (input) => {
                const box = await input.boundingBox();
                return { input, y: box?.y || 0 };
            }));
            inputsWithPosition.sort((a, b) => a.y - b.y);
            const emailInput = inputsWithPosition[0].input;
            await emailInput.fill(email);
            logger.debug('  ✅ Filled top-most input with email');
            const passwordInput = await page.locator('input[type="password"]').first();
            if (await passwordInput.isVisible()) {
                await passwordInput.fill(password);
                logger.debug('  ✅ Filled password input');
            }
            else {
                if (inputsWithPosition.length > 1) {
                    await inputsWithPosition[1].input.fill(password);
                    logger.debug('  ✅ Filled second input with password');
                }
            }
            await page.waitForTimeout(500);
            const submitButton = await page.locator(`
        button:has-text("Sign in"),
        button:has-text("Log in"), 
        button:has-text("Login"),
        button:has-text("Submit"),
        button[type="submit"],
        input[type="submit"]
      `).first();
            if (await submitButton.isVisible()) {
                await submitButton.click();
            }
            else {
                await page.locator('input[type="password"]').press('Enter');
                logger.debug('  ⚠️ No submit button found, pressed Enter');
            }
            return true;
        }
        catch (error) {
            await logger.error(error, {
                userAction: 'Visual proximity authentication strategy',
                severity: core_1.ErrorSeverity.MEDIUM,
                metadata: { strategy: 'visualProximity' }
            });
            return false;
        }
    }
};
exports.formDetectionStrategy = {
    name: 'Form Detection',
    async execute(page, email, password, debug) {
        const logger = (0, core_1.createModuleLogger)({
            module: 'AuthStrategy.FormDetection',
            debug,
            defaultCategory: core_1.ErrorCategory.AUTHENTICATION
        });
        try {
            logger.debug('  🔄 Using Form Detection Strategy...');
            const forms = await page.locator('form:has(input[type="password"])').all();
            if (forms.length === 0) {
                throw new Error('No forms with password fields found');
            }
            const form = forms[0];
            const emailInput = await form.locator(`
        input[type="email"],
        input[type="text"][name*="email"],
        input[type="text"][name*="user"],
        input[type="text"]:not([type="password"])
      `).first();
            const passwordInput = await form.locator('input[type="password"]').first();
            if (await emailInput.isVisible()) {
                await emailInput.fill(email);
                logger.debug('  ✅ Filled email in form');
            }
            await passwordInput.fill(password);
            logger.debug('  ✅ Filled password in form');
            const submitButton = await form.locator('button[type="submit"], input[type="submit"], button').first();
            if (await submitButton.isVisible()) {
                await submitButton.click();
            }
            else {
                await form.press('Enter');
            }
            logger.debug('  ✅ Submitted form');
            return true;
        }
        catch (error) {
            await logger.error(error, {
                userAction: 'Form detection authentication strategy',
                severity: core_1.ErrorSeverity.MEDIUM,
                metadata: { strategy: 'formDetection' }
            });
            return false;
        }
    }
};
exports.aiAssistedStrategy = {
    name: 'AI-Assisted Heuristics',
    async execute(page, email, password, debug) {
        const logger = (0, core_1.createModuleLogger)({
            module: 'AuthStrategy.AIAssisted',
            debug,
            defaultCategory: core_1.ErrorCategory.AUTHENTICATION
        });
        try {
            logger.debug('  🔄 Using AI-Assisted Strategy...');
            const pageText = await page.textContent('body');
            const lowerText = pageText?.toLowerCase() || '';
            const loginPatterns = ['sign in', 'log in', 'login', 'email', 'password', 'username'];
            const isLikelyLoginPage = loginPatterns.some(pattern => lowerText.includes(pattern));
            if (!isLikelyLoginPage) {
                throw new Error('Does not appear to be a login page');
            }
            const emailFilled = await page.evaluate(async (email) => {
                const selectors = [
                    'input[type="email"]',
                    'input[name*="email"]',
                    'input[placeholder*="email"]',
                    'input[id*="email"]',
                    'input[name*="user"]',
                    'input[placeholder*="user"]',
                    'input[id*="user"]',
                    'input[type="text"]:not([type="password"])'
                ];
                for (const selector of selectors) {
                    const input = document.querySelector(selector);
                    if (input && input.offsetHeight > 0) {
                        input.value = email;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        return true;
                    }
                }
                return false;
            }, email);
            if (emailFilled) {
                await page.waitForTimeout(200);
            }
            await page.locator('input[type="password"]').first().fill(password);
            await page.waitForTimeout(200);
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                const submitButton = buttons.find(btn => {
                    const text = btn.textContent?.toLowerCase() || '';
                    const value = btn.value?.toLowerCase() || '';
                    return ['sign in', 'log in', 'login', 'submit'].some(term => text.includes(term) || value.includes(term));
                });
                if (submitButton) {
                    submitButton.click();
                }
                else {
                    const form = document.querySelector('form');
                    if (form)
                        form.submit();
                }
            });
            return true;
        }
        catch (error) {
            await logger.error(error, {
                userAction: 'AI-assisted authentication strategy',
                severity: core_1.ErrorSeverity.MEDIUM,
                metadata: { strategy: 'aiAssisted' }
            });
            return false;
        }
    }
};
async function executeAuthStrategies(page, email, password, debug) {
    const logger = (0, core_1.createModuleLogger)({
        module: 'AuthStrategies',
        debug,
        defaultCategory: core_1.ErrorCategory.AUTHENTICATION
    });
    const strategies = [
        exports.tabOrderStrategy,
        exports.visualProximityStrategy,
        exports.formDetectionStrategy,
        exports.aiAssistedStrategy
    ];
    for (const strategy of strategies) {
        logger.debug(`\n🎯 Trying ${strategy.name}...`);
        const result = await (0, core_1.executeOperation)(async () => {
            const success = await strategy.execute(page, email, password, debug);
            if (success) {
                await page.waitForTimeout(3000);
                const currentUrl = page.url();
                const pageText = await page.textContent('body');
                const onLoginPage = currentUrl.includes('login') ||
                    currentUrl.includes('signin') ||
                    (pageText?.toLowerCase().includes('password') &&
                        pageText?.toLowerCase().includes('email'));
                if (!onLoginPage) {
                    logger.debug(`  ✅ ${strategy.name} succeeded!`);
                    return true;
                }
                else {
                    logger.debug(`  ⚠️ ${strategy.name} executed but still on login page`);
                    return false;
                }
            }
            return false;
        }, {
            name: `Execute ${strategy.name}`,
            category: core_1.ErrorCategory.AUTHENTICATION,
            severity: core_1.ErrorSeverity.MEDIUM,
            fallback: false
        });
        if (result.success && result.data) {
            return true;
        }
    }
    logger.warn('All authentication strategies failed');
    return false;
}
