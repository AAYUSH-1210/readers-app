// backend/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "update-trending",
      script: "./scripts/update-trending.js",
      interpreter: "node",
      // schedule: restart (run) every hour at minute 5 — change to taste
      cron_restart: "5 * * * *",
      env: {
        NODE_ENV: "production",
        MONGO_URI:
          process.env.MONGO_URI || "mongodb://localhost:27017/readers-app",
        TRENDING_LIMIT: "100",
        TRENDING_WINDOW_DAYS: "7",
      },
      // Ensure logs are saved somewhere accessible:
      error_file: "./logs/update-trending-err.log",
      out_file: "./logs/update-trending-out.log",
      merge_logs: true,
    },
  ],
};
