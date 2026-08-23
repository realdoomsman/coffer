# CofferFun Organization Setup Guide

## GitHub Organization Setup: https://github.com/CofferFun

### Repository Organization

**Current Repository**: `realdoomsman/coffer`
**Target Organization**: `CofferFun/coffer`

### Step-by-Step Professional Setup

#### 1. Move Repository to Organization
```bash
# Clone the repository locally (if not already)
git clone https://github.com/realdoomsman/coffer.git
cd coffer

# Create new repository in organization
# Go to: https://github.com/CofferFun/new
# Create repository named "coffer" with description:
# "Trader vaults on Solana — traders trade pooled capital they can never withdraw"

# Update remote to point to organization
git remote set-url origin https://github.com/CofferFun/coffer.git

# Push to new location
git push -u origin master
```

#### 2. Configure Repository Settings

**Repository Settings → General:**
- Name: `coffer`
- Description: `Trader vaults on Solana — traders trade pooled capital they can never withdraw`
- Website: `https://coffer.fun`
- Topics: `solana`, `defi`, `trading`, `vaults`, `jupiter`, `crypto`
- License: `MIT`
- Visibility: Public

**Repository Settings → Features:**
- ✅ Issues
- ✅ Projects  
- ✅ Discussions
- ✅ Actions
- ✅ Security
- ✅ Wiki

#### 3. Team Structure

**Teams to Create:**
- `@CofferFun/developers` - Full access to code
- `@CofferFun/core` - Core maintainers
- `@CofferFun/contributors` - External contributors

**Permissions:**
- Developers: Write access, can merge PRs
- Core: Admin access, can manage settings
- Contributors: Read access, can submit PRs

#### 4. Branch Protection Rules

**Settings → Branches → Add Rule:**
- Branch name pattern: `master`
- ✅ Require pull request before merging
  - Require approvals: 1
- ✅ Require status checks to pass before merging
  - Required checks: `build`, `test`
- ✅ Require branches to be up to date before merging
- ✅ Block force pushes
- ✅ Require signed commits

#### 5. GitHub Actions Setup

**`.github/workflows/deploy.yml`:**
```yaml
name: Deploy to Railway

on:
  push:
    branches: [master]
  pull_request:
    branches: [master]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - run: npm run test
```

#### 6. Environment Variables

**Settings → Secrets and variables → Actions:**
- `RAILWAY_TOKEN`: Your Railway API token
- `DATABASE_URL`: Production database URL
- `FRONTEND_URL`: https://coffer.fun

#### 7. Issue Templates

**`.github/ISSUE_TEMPLATE/bug_report.md`:**
```markdown
---
name: Bug Report
about: Report a bug in the Coffer vault platform
title: '[BUG] '
labels: bug
---

## Description
A clear description of what the bug is.

## Reproduction Steps
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

## Expected Behavior
What should have happened.

## Screenshots
If applicable, add screenshots.

## Environment
- OS: [e.g. Windows 11, macOS]
- Browser: [e.g. Chrome, Firefox]
- Version: [e.g. 1.0.0]
```

#### 8. Pull Request Template

**`.github/pull_request_template.md`:**
```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
Describe how you tested this change

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests added/updated
- [ ] All tests passing
```

#### 9. Documentation

**Repository Files to Add:**
- `README.md` - Professional project overview
- `CONTRIBUTING.md` - How to contribute
- `SECURITY.md` - Security policy
- `LICENSE` - MIT license
- `docs/` - Additional documentation

#### 10. Status Badges

**Add to README.md:**
```markdown
[![GitHub](https://img.shields.io/github/license/CofferFun/coffer)]
[![Build](https://img.shields.io/github/actions/workflow/status/CofferFun/coffer/deploy.yml)]
[![Website](https://img.shields.io/badge/website-coffer.fun-blue)]
```

#### 11. Labels

**Settings → Labels → Create Labels:**
- `bug` - Red
- `enhancement` - Green
- `documentation` - Blue
- `critical` - Red
- `wontfix` - Gray
- `help wanted` - Yellow
- `good first issue` - Pink

#### 12. Milestones

**Settings → Milestones:**
- `v1.0.0` - Initial launch
- `v1.1.0` - Feature enhancements
- `v1.2.0` - Mobile optimization

#### 13. Projects

**Projects → New Project:**
- `Coffer Roadmap` - Track development progress
- `Bug Tracker` - Track and prioritize bugs
- `Feature Requests` - Community feedback

#### 14. Webhooks

**Settings → Webhooks → Add Webhook:**
- Payload URL: Railway deployment webhook
- Content type: application/json
- Events: Push, Pull Request

### Immediate Actions Required

1. **Create organization repository**: Go to https://github.com/CofferFun/new and create the repository
2. **Move existing code**: Follow the commands above to push to the new repository
3. **Configure settings**: Apply all the configuration steps
4. **Update Railway**: Change the GitHub integration to point to `CofferFun/coffer`
5. **Update local remote**: Run `git remote set-url origin https://github.com/CofferFun/coffer.git`

### Professional Setup Benefits

- ✅ Clear team structure and permissions
- ✅ Automated CI/CD pipeline
- ✅ Professional issue and PR workflow
- ✅ Comprehensive documentation
- ✅ Security best practices
- ✅ Professional branding and organization
- ✅ Scalable team collaboration

### Next Steps

Once repository is moved to organization:
1. Update Railway to use new repository
2. Configure CI/CD pipeline
3. Set up branch protection
4. Create team structure
5. Add professional documentation

**The CofferFun organization will provide a professional, scalable foundation for the vault platform!**