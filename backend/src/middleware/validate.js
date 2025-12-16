// backend/src/middleware/validate.js
// Validation middleware wrapper for express-validator rules.
// Executes validation rules and returns a structured 400 response on failure.

import { validationResult } from "express-validator";

/**
 * Wraps express-validator rules into a reusable middleware.
 *
 * @param {Array} rules - Array of validation chains
 */
export function validate(rules = []) {
  return async (req, res, next) => {
    // Execute each validation rule sequentially
    for (const rule of rules) {
      await rule.run(req);
    }

    // Collect validation results
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      // Normalize error response shape
      return res.status(400).json({
        errors: errors.array().map((e) => ({
          field: e.path,
          msg: e.msg,
        })),
      });
    }

    return next();
  };
}
