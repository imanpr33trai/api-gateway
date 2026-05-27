export const defaultPort = "11434";
export const defaultHost = `http://127.0.0.1:${defaultPort}`;

export const MINIMAX = {
     OAUTH: {
          CLIENT_ID: "78257093-7e40-4613-99e0-527b14b39113",
          SCOPE: "group_id profile model.completion",
          GRANT_TYPE: "urn:ietf:params:oauth:grant-type:user_code",
          REFRESH_SKEW_SECONDS: 60,
     },
     ENDPOINTS: {
          global: {
               portal: "https://api.minimax.io",
               inference: "https://api.minimax.io/anthropic",
          },
          cn: {
               portal: "https://api.minimaxi.com",
               inference: "https://api.minimaxi.com/anthropic",
          },
     },
     // Type-safe addition: Provider-specific metadata
     DEFAULT_REGION: "global",
} as const;

export const QWEN = {
     OAUTH: {
          CLIENT_ID: "78257093-7e40-4613-99e0-527b14b39113",
     },
     ENDPOINTS: {
          BASE_URL: "https://portal.qwen.ai/v1",
          TOKEN_URL: "https://chat.qwen.ai/api/v1/oauth2/token",
     },
};
