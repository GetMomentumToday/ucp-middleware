# Tickets to Create in Notion

Once Notion is reconnected, create these in the Kanban Board.

## P0 Critical — Phase 3

### 1. Magento: authoritative pricing + inventory validation (est: 3)

Labels: Backend, Adapter | Phase 3

- Stock validation: check qty and is_in_stock from product response
- Return 400 if out of stock or insufficient qty
- Integration test against local Magento
- Live test in CI

### 2. Shopware: authoritative pricing + inventory validation (est: 3)

Labels: Backend, Adapter | Phase 3

- Check available and availableStock from product
- Return 400 if out of stock
- Integration test against local Shopware

### 3. CI: adapter integration tests against real Magento + Shopware (est: 5)

Labels: Testing, CI/CD | Phase 3

- Separate workflow: test-adapters.yml
- Start platforms via docker-compose.platforms.yml
- Seed products + create tenants
- Run per-adapter test suites: catalog, cart, pricing, stock, fulfillment, discounts, payment, order
- Report pass/fail per adapter
- Run on PR + weekly schedule

### 4. CI: run UCP conformance tests against MockAdapter (est: 3)

Labels: Testing, CI/CD | Phase 3

- Install Python 3.10+ and uv in CI
- Clone conformance repo + python-sdk
- Seed mock tenant with conformance products
- Start gateway, run all 13 test files
- npm run test:conformance script
- Current baseline: 32/47, fail CI on regression

## P1 High — Phase 3

### 5. Magento: fulfillment extension — shipping methods (est: 5)

Labels: Backend, Adapter | Phase 3

- Estimate shipping: POST /rest/V1/guest-carts/{id}/estimate-shipping-methods
- Map carriers to UCP FulfillmentOptions with real costs
- Set selected method via shipping-information endpoint

### 6. Magento: discount extension — coupon codes (est: 3)

Labels: Backend, Adapter | Phase 3

- Apply coupon: PUT /rest/V1/guest-carts/{id}/coupons/{code}
- Read discounts from cart totals
- Handle invalid codes (404)

### 7. Magento: payment failure handling (est: 2)

Labels: Backend, Adapter | Phase 3

- Map instrument handler_id to Magento payment method
- Return 402 on payment failure
- Handle unsupported methods

### 8. Shopware: fulfillment extension — shipping methods (est: 5)

Labels: Backend, Adapter | Phase 3

- List methods: GET /store-api/shipping-method
- Map to UCP FulfillmentOptions with real prices
- Set via PATCH /store-api/context with shippingMethodId

### 9. Shopware: discount extension — promotions (est: 3)

Labels: Backend, Adapter | Phase 3

- Apply code: POST /store-api/checkout/cart/code
- Read promotions from cart lineItems
- Handle invalid codes

### 10. Shopware: payment failure handling (est: 2)

Labels: Backend, Adapter | Phase 3

- Map errors to 402 payment_declined
- Map handler_id to Shopware payment method ID
- Handle unsupported methods

## Total: 34 story points
