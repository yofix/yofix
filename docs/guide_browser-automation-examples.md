# YoFix Browser Automation Examples

YoFix includes powerful browser automation capabilities that allow you to interact with your preview deployments using natural language commands.

## Basic Usage

Simply mention `@yofix` with the `browser` command followed by your instruction in quotes:

```
@yofix browser "navigate to /dashboard and take a screenshot"
```

## Examples

### Navigation
```
@yofix browser "go to the homepage"
@yofix browser "navigate to /products/123"
@yofix browser "open the contact page"
```

### Interactions
```
@yofix browser "click the login button"
@yofix browser "click on the hamburger menu"
@yofix browser "hover over the dropdown menu"
```

### Form Filling
```
@yofix browser "fill the email field with test@example.com"
@yofix browser "type 'Hello World' in the message textarea"
@yofix browser "fill out the contact form and submit it"
```

### Visual Verification
```
@yofix browser "check that the header looks correct"
@yofix browser "verify the layout is not broken"
@yofix browser "ensure the buttons are properly aligned"
```

### Complex Workflows
```
@yofix browser "login with test@example.com and password123, then navigate to settings"
@yofix browser "click on products, scroll down, and take a screenshot of the pricing table"
@yofix browser "open the mobile menu and check if all links are visible"
```

### Scrolling
```
@yofix browser "scroll down to the footer"
@yofix browser "scroll to the testimonials section"
@yofix browser "scroll up to the top"
```

### Waiting
```
@yofix browser "wait for the loading spinner to disappear"
@yofix browser "wait 3 seconds for animations to complete"
@yofix browser "wait until the chart appears"
```

## Security Features

YoFix includes built-in security features to protect against malicious commands:

- **Domain Validation**: Only allowed domains can be accessed
- **Script Sanitization**: JavaScript evaluation is sandboxed
- **Input Validation**: Prevents script injection attempts
- **File Upload Restrictions**: Only safe file types allowed
- **Network Isolation**: Limited to preview deployments

## Compound Commands

You can chain multiple actions together:

```
@yofix browser "go to /login, fill email with admin@test.com, fill password with test123, click login button, then take a screenshot"
```

## Advanced Examples

### Testing Responsive Design
```
@yofix browser "navigate to homepage and check if mobile menu is hidden on desktop"
```

### Verifying Form Validation
```
@yofix browser "fill the email field with 'invalid-email' and click submit, then check for error message"
```

### Testing Interactive Elements
```
@yofix browser "click on all accordion items and verify they expand correctly"
```

## Tips

1. **Be Specific**: The more specific your commands, the better the results
2. **Use Quotes**: Always wrap your command in quotes
3. **Natural Language**: Write commands as you would explain to a person
4. **Visual Checks**: Combine with `@yofix scan` for comprehensive testing

## Limitations

- Commands timeout after 30 seconds
- Maximum 10 actions per command
- Some sites may block automated browsers
- Complex JavaScript interactions may require multiple commands

## Coming Soon

- Record and replay workflows
- Visual regression after interactions
- Performance metrics collection
- Accessibility testing during automation