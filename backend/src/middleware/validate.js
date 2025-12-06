// backend/src/middleware/validate.js
export function validate(rules) {
  return async (req, res, next) => {
    for (let rule of rules) {
      await rule.run(req);
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array().map((e) => ({ field: e.path, msg: e.msg })),
      });
    }

    next();
  };
}
