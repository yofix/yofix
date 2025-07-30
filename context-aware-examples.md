# Context-Aware Dynamic Element Scoring Examples

## **Before (Hardcoded Patterns)**
```typescript
// Fixed penalties regardless of user intent
const negativePatterns = [
  { pattern: /help|support|contact/i, score: -50, reason: 'PENALTY: help/support' },
  { pattern: /forgot|reset/i, score: -60, reason: 'PENALTY: forgot/reset action' }
];
```
**Problem**: "Help" gets penalized even when user wants help!

## **After (Context-Aware Dynamic Scoring)**

### **Login Context**
```
Task: "login to website"
Intent: login
Avoid: ['forgot', 'reset', 'register', 'help']

Positive Patterns:
- /^login$/i → +75 points
- /sign.*in/i → +50 points

Negative Patterns:  
- /forgot.*password/i → -80 points ✅
- /help|support/i → -50 points ✅
```
**Result**: "Forgot password?" gets heavy penalty, "Login" gets boost

### **Help/Support Context**
```
Task: "get help with my account"
Intent: help
Avoid: ['close', 'cancel', 'skip']

Positive Patterns:
- /^help$/i → +80 points ✅
- /^support$/i → +75 points ✅
- /^contact$/i → +70 points ✅

Negative Patterns:
- /close|cancel/i → -40 points
```
**Result**: "Help" button now gets priority instead of penalty!

### **E-commerce Context**
```
Task: "buy product and add to cart"  
Intent: purchase
Avoid: ['save.*later', 'wishlist', 'compare']

Positive Patterns:
- /^buy.*now$/i → +80 points
- /^add.*cart$/i → +75 points
- /^checkout$/i → +70 points

Negative Patterns:
- /save.*later|wishlist/i → -60 points
- /compare/i → -50 points
```
**Result**: "Add to Cart" prioritized over "Save for Later"

### **Form Submission Context**
```
Task: "submit application form"
Intent: submit  
Avoid: ['cancel', 'reset', 'clear']

Positive Patterns:
- /^submit$/i → +80 points
- /^send$/i → +75 points
- /^apply$/i → +70 points

Negative Patterns:
- /cancel|reset|clear/i → -60 points
```
**Result**: "Submit" gets priority over "Cancel"

## **Dynamic Adaptation Examples**

### **Scenario 1: Login Flow**
```
User Task: "login to the website"
Page Elements: ["Login", "Forgot Password?", "Register", "Help"]

Scoring Results:
✅ Login: +75 (exact login) +30 (after inputs) = 105 points
❌ Forgot Password?: -80 (password recovery) = -80 points  
❌ Register: -70 (registration action) = -70 points
❌ Help: -50 (help/support) = -50 points
```

### **Scenario 2: Support Request**
```
User Task: "contact support for billing issue"  
Page Elements: ["Contact Support", "Live Chat", "Close", "Cancel"]

Scoring Results:
✅ Contact Support: +70 (contact action) = 70 points
✅ Live Chat: +50 (contains help) = 50 points
❌ Close: -40 (close/cancel) = -40 points
❌ Cancel: -40 (close/cancel) = -40 points
```

### **Scenario 3: E-commerce Purchase**
```
User Task: "add item to shopping cart"
Page Elements: ["Add to Cart", "Buy Now", "Save for Later", "Compare"]

Scoring Results:
✅ Add to Cart: +75 (add to cart) = 75 points
✅ Buy Now: +80 (buy now action) = 80 points
❌ Save for Later: -60 (save for later) = -60 points
❌ Compare: -50 (comparison) = -50 points
```

## **Key Benefits**

1. **Universal Applicability**: Works across login, e-commerce, forms, help systems
2. **Context Awareness**: Same text gets different scores based on user intent
3. **User-Specified Avoidance**: Can explicitly avoid certain actions
4. **Intelligent Defaults**: Fallback to generic patterns when context unclear
5. **Debugging Visibility**: Clear reasoning for why elements were chosen

## **Implementation Architecture**

```
User Task → Task Context Analyzer → Dynamic Pattern Generator → Element Scorer → Best Match
     ↓              ↓                        ↓                     ↓            ↓
"login now"    intent: login         +80 for /login/        Score elements   "Login" button
                avoid: [forgot]       -80 for /forgot/      based on context  (highest score)
```

This solves the original problem: **scoring is now contextual, not hardcoded for one site type**.