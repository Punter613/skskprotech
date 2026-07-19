# AI Layer Contract

## RULES

1. Only `/ai/aiClient.js` is used outside AI layer
2. No service, route, or pipeline imports providers directly
3. Providers are stateless adapters only
4. All intelligence routing is handled in aiClient

## STRUCTURE

- aiClient → routing layer
- providers/* → vendor adapters
- groq.js → raw API wrapper (isolated)
