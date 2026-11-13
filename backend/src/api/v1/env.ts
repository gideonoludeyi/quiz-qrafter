// Context variables shared by the API routes.
export type AppEnv = {
  Variables: {
    // The logged-in user's id, or undefined for anonymous requests.
    userId: number | undefined;
  };
};
