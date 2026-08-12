# Product Behavior

## Core Concepts

### User

A user is identified by Telegram identity.

On first successful login or `/start`, Keepy:

- creates a user row
- stores Telegram profile fields when available
- sets timezone to `Asia/Shanghai` by default
- creates one default book named `默认`

### Book

A book belongs to one user.

Fields currently supported by the UI and service layer:

- name
- currency
- initial balance
- current balance
- monthly budget
- default flag

Constraints:

- a user can have multiple books
- a user can have only one default book
- a user cannot have two books with the same name

### Bill

A bill belongs to one user and one book.

Fields:

- amount
- purpose
- occurred time

Interpretation:

- positive amount: expense
- negative amount: income

## Parsing Rules

Incoming text messages are parsed as:

```text
数字 [用途] [账本]
```

Examples:

- `12 午饭`
- `59.9 咖啡 默认`
- `-3000 工资`

Behavior details:

- empty input is rejected
- non-numeric first token is rejected
- if only the amount is provided, purpose defaults to `默认`
- if multiple trailing tokens exist, the final token is treated as a book name only when it matches an existing book exactly

## Monthly Summary Rules

The monthly summary is computed per book and month.

Values:

- `expenseTotal`: sum of positive amounts
- `incomeTotal`: absolute sum of negative amounts
- `netBalance`: `incomeTotal - expenseTotal`
- `budgetRemaining`: `monthlyBudget - expenseTotal`, or `null` when no budget is set

Month grouping is timezone-aware and uses the user's timezone.

## Mini App Behavior

Current pages:

- home summary
- settings for the default book
- books list and new-book form
- book- and month-filtered history with total expenses and income for the selected month

History totals use the monthly summary rules above, so positive records contribute to total expenses
and the absolute value of negative records contributes to total income.

Current validations:

- empty book name is rejected
- duplicate book name returns HTTP 400
- selecting a missing default book returns HTTP 400

## Authentication Model

Keepy supports two Telegram-backed login paths:

- Telegram WebApp `initData`
- Telegram Login Widget

After verification, the server issues a signed cookie named `keepy_session`.

Cookie properties:

- `httpOnly`
- `sameSite=lax`
- `secure` in production
- 30-day lifetime

## Current Limitations

- timezone is configurable from the user settings page and affects display plus bot replies only
- there is no bill editing or deletion UI
- there is no pagination for history pages
- there is no separate API surface for the Mini App
