# Comment Threading Flow

YoFix maintains comment continuity by posting results as replies to triggering comments. This keeps conversations organized and easy to follow.

## Visual Flow

```
┌─────────────────────────────────────────────────────────┐
│ User posts: @yofix test https://example.com/dashboard  │
│ Comment ID: 123456                                      │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ YoFix immediately reacts with 👀                        │
│ Message: "I see your command, processing..."           │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ Step 0.5: Detects comment command                      │
│ - Stores commentId: 123456                             │
│ - Stores commentUrl                                    │
│ - Parses command arguments                             │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ Steps 1-3: Execute testing workflow                    │
│ - Skip route analysis (use explicit URL)               │
│ - Capture screenshots                                  │
│ - Compare with baselines                               │
│ - Upload to storage                                    │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ Step 4: Post Results                                   │
│ - Detects commandContext.commentId: 123456             │
│ - Posts as REPLY to comment 123456                     │
│ - NOT as a new comment!                                │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│ Final: React with ✅                                    │
│ Message: "Command complete!"                           │
└─────────────────────────────────────────────────────────┘
```

## Comment Structure

### When Triggered by @yofix Command

```
┌─ Original Comment (#123456) ─────────────────────┐
│ @yofix test https://example.com/dashboard       │
│                                                  │
│ Reactions: 👀 ✅                                 │
└──────────────────────────────────────────────────┘
        │
        └─▶ Reply Comment (#123457) ──────────────┐
            │ ## ✅ Runtime PR Verification        │
            │                                      │
            │ **Test Results:**                    │
            │ - ✅ /dashboard - 3 screenshots      │
            │ - No visual changes detected         │
            │                                      │
            │ [View screenshots]                   │
            └──────────────────────────────────────┘
```

### Regular PR Run (Not Triggered by Comment)

```
┌─ YoFix Main Comment ─────────────────────────────┐
│ ## ✅ Runtime PR Verification                    │
│                                                  │
│ **Test Results:**                                │
│ - ✅ /dashboard - 3 screenshots                  │
│ - ✅ /profile - 3 screenshots                    │
│ - No visual changes detected                     │
│                                                  │
│ [View screenshots]                               │
│                                                  │
│ (Updated on each PR push)                        │
└──────────────────────────────────────────────────┘
```

## Implementation Details

### Step 0.5: Handle Comment Command

Captures comment context:
```typescript
return {
  ...stepData,
  commandContext: {
    isCommentCommand: true,
    commentId: 123456,
    commentUrl: "https://github.com/org/repo/pull/42#issuecomment-123456",
  },
  testUrl: "https://example.com/dashboard",
};
```

### Step 4: Post Results

Checks for comment context:
```typescript
const isCommentCommand = stepData.commandContext?.isCommentCommand;
const replyToCommentId = stepData.commandContext?.commentId;

await reporter.postResults(
  verificationResult,
  prNumber.toString(),
  isCommentCommand && replyToCommentId
    ? { replyToCommentId }  // Post as reply
    : undefined            // Post as main comment
);
```

### PRReporter

Posts with proper threading:
```typescript
if (options?.replyToCommentId) {
  // Reply to triggering comment
  await this.commentEngine.postComment(comment, {
    inReplyTo: options.replyToCommentId,
    signature: `yofix-command-result-${options.replyToCommentId}`
  });
} else {
  // Update main YoFix comment
  await this.commentEngine.postComment(comment, {
    updateExisting: true,
    signature: 'yofix-verification-results'
  });
}
```

## Benefits

✅ **Organized Conversations**
- All related comments stay together
- Easy to follow discussion thread
- No scattered results across PR

✅ **Clear Context**
- Results appear directly below the command
- Users can see what they requested vs. what was delivered
- Multiple commands create separate threads

✅ **Better UX**
- Immediate acknowledgment (👀)
- Clear completion signal (✅)
- Results exactly where expected

## Example Workflow

1. **Developer comments:** `@yofix test https://staging.example.com/checkout 375x667`
2. **YoFix reacts:** 👀 "Processing your test command..."
3. **YoFix runs tests** in background (30-60 seconds)
4. **YoFix replies** with full results in same thread
5. **YoFix reacts:** ✅ "All done!"

6. **Developer reviews** results in-context
7. **Developer may comment again** with different parameters
8. **Each command** gets its own reply thread

## Comparison: Before vs. After

### Before (Without Comment Threading)
```
Comment #1: @yofix test url1
Comment #2: [Main YoFix comment with all results]
Comment #3: @yofix test url2
Comment #4: [Main YoFix comment updated - lost url1 results]
```
❌ Hard to track which results match which command
❌ Previous results get overwritten
❌ Confusing conversation flow

### After (With Comment Threading)
```
Comment #1: @yofix test url1
    └─ Reply: [Results for url1] ✅

Comment #2: @yofix test url2
    └─ Reply: [Results for url2] ✅
```
✅ Clear one-to-one mapping
✅ All results preserved
✅ Natural conversation flow

## Technical Notes

- Uses GitHub's `inReplyTo` API for threading
- Each command result has unique signature: `yofix-command-result-{commentId}`
- Regular PR runs use signature: `yofix-verification-results`
- Comment engine handles deduplication automatically
- Reactions (👀, ✅) attached to triggering comment, not reply

## Future Enhancements

Potential improvements:
- Thread-based status updates during long operations
- Reaction emojis for different completion states (⚠️ for warnings, ❌ for failures)
- Support for multiple concurrent commands with separate threads
- Interactive follow-up commands within threads
