"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportFormatter = void 0;
class ReportFormatter {
    formatScanResult(scan) {
        const { issues, summary, duration } = scan;
        if (issues.length === 0) {
            return this.formatNoIssues(scan);
        }
        let report = `## 🔍 YoFix Scan Results

**Found ${issues.length} visual issue${issues.length > 1 ? 's' : ''}** in ${(duration / 1000).toFixed(1)}s

### Summary
`;
        const severityEmojis = {
            critical: '🚨',
            high: '⚠️',
            medium: '💡',
            low: 'ℹ️'
        };
        for (const [severity, count] of Object.entries(summary.bySeverity)) {
            if (count > 0) {
                report += `- ${severityEmojis[severity]} **${severity}**: ${count}\n`;
            }
        }
        report += '\n### Issues Found\n\n';
        for (const issue of issues) {
            report += this.formatIssueShort(issue);
        }
        report += `
### 💬 Next Steps
- \`@yofix fix\` - Generate fixes for all issues
- \`@yofix fix #1\` - Fix specific issue
- \`@yofix explain #1\` - Get detailed explanation
- \`@yofix report\` - View full report with screenshots
`;
        return report;
    }
    formatNoIssues(scan) {
        return `## ✅ YoFix Scan Complete

**No visual issues detected!** 🎉

Scanned ${scan.routes.length} route${scan.routes.length > 1 ? 's' : ''} in ${(scan.duration / 1000).toFixed(1)}s

Your UI changes look good across all viewports.`;
    }
    formatIssueShort(issue) {
        const severityEmoji = {
            critical: '🚨',
            high: '⚠️',
            medium: '💡',
            low: 'ℹ️'
        }[issue.severity];
        return `**#${issue.id}** ${severityEmoji} **${issue.type}**: ${issue.description}
   - Route: \`${issue.location.route}\`
   - Affects: ${issue.affectedViewports.join(', ')}
   ${issue.location.selector ? `- Element: \`${issue.location.selector}\`` : ''}

`;
    }
    formatFixResult(result) {
        if (result.generated === 0) {
            return `## ❌ No Fixes Generated

Unable to generate fixes for the detected issues. This might be because:
- Issues require manual intervention
- Insufficient context to generate fixes
- Issues are in third-party components

Consider fixing these manually or providing more context.`;
        }
        let report = `## 🔧 YoFix Generated ${result.generated} Fix${result.generated > 1 ? 'es' : ''}

`;
        for (const fix of result.fixes) {
            report += this.formatFix(fix);
        }
        report += `
### 💬 Actions
- \`@yofix preview\` - Preview fixes before applying
- \`@yofix apply\` - Apply all fixes
- \`@yofix apply #${result.fixes[0]?.id}\` - Apply specific fix
`;
        return report;
    }
    formatFix(fix) {
        let fixReport = `### Fix #${fix.id} for Issue #${fix.issueId}
**${fix.description}** (Confidence: ${Math.round(fix.confidence * 100)}%)

`;
        for (const file of fix.files) {
            fixReport += `📝 **${file.path}**
\`\`\`${file.language}
`;
            for (const change of file.changes) {
                if (change.type === 'add') {
                    fixReport += `+ ${change.content}\n`;
                }
                else if (change.type === 'remove') {
                    fixReport += `- ${change.original}\n`;
                }
                else {
                    fixReport += `- ${change.original}\n+ ${change.content}\n`;
                }
            }
            fixReport += '```\n\n';
        }
        return fixReport;
    }
    formatExplanation(issue, explanation) {
        return `## 🔍 Detailed Analysis: Issue #${issue.id}

### ${issue.type}
${issue.description}

### 📊 Impact
- **Severity**: ${issue.severity}
- **Affected Viewports**: ${issue.affectedViewports.join(', ')}
- **Location**: \`${issue.location.route}\`
${issue.location.selector ? `- **Element**: \`${issue.location.selector}\`` : ''}
${issue.location.file ? `- **File**: \`${issue.location.file}:${issue.location.line}\`` : ''}

### 🧠 AI Analysis
${explanation}

### 🖼️ Visual Evidence
${issue.screenshot ? this.formatScreenshots(issue.screenshot) : 'No screenshots available'}

### 💡 Recommended Action
Run \`@yofix fix #${issue.id}\` to generate a fix for this issue.`;
    }
    formatScreenshots(screenshots) {
        let result = '<table>\n<tr>\n';
        if (screenshots.baseline) {
            result += '<td align="center"><strong>Baseline</strong><br><img src="' +
                screenshots.baseline + '" width="200"></td>\n';
        }
        result += '<td align="center"><strong>Current</strong><br><img src="' +
            screenshots.current + '" width="200"></td>\n';
        if (screenshots.diff) {
            result += '<td align="center"><strong>Difference</strong><br><img src="' +
                screenshots.diff + '" width="200"></td>\n';
        }
        result += '</tr>\n</table>\n';
        return result;
    }
    generateFullReport(scan) {
        let report = `## 📊 YoFix Complete Visual Analysis Report

**PR Analysis Summary**
- Scanned: ${scan.routes.length} routes
- Duration: ${(scan.duration / 1000).toFixed(1)}s
- Total Issues: ${scan.issues.length}

`;
        if (Object.keys(scan.summary.byType).length > 0) {
            report += '### Issues by Type\n';
            for (const [type, count] of Object.entries(scan.summary.byType)) {
                report += `- **${type}**: ${count}\n`;
            }
            report += '\n';
        }
        report += '### Routes Analyzed\n';
        for (const route of scan.routes) {
            const routeIssues = scan.issues.filter(i => i.location.route === route);
            report += `- \`${route}\` - ${routeIssues.length} issues\n`;
        }
        report += '\n';
        if (scan.issues.length > 0) {
            report += '### Detailed Issue List\n\n';
            for (const issue of scan.issues) {
                report += `<details>
<summary><strong>#${issue.id} - ${issue.type}</strong> (${issue.severity})</summary>

${issue.description}

**Details:**
- Route: \`${issue.location.route}\`
- Viewports: ${issue.affectedViewports.join(', ')}
${issue.location.selector ? `- Selector: \`${issue.location.selector}\`` : ''}
${issue.location.file ? `- Source: \`${issue.location.file}:${issue.location.line}\`` : ''}

</details>

`;
            }
        }
        report += `### 🚀 Ready to Fix?
Run \`@yofix fix\` to generate fixes for all issues, or target specific issues with \`@yofix fix #1\`.

---
*Generated by [YoFix](https://yofix.dev) - AI-powered visual testing & auto-fix*`;
        return report;
    }
}
exports.ReportFormatter = ReportFormatter;
