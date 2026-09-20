import { createAuthClient } from "better-auth/react";
import {
  lastLoginMethodClient,
  organizationClient,
} from "better-auth/client/plugins";

export const clientAuth = createAuthClient({
  plugins: [lastLoginMethodClient(), organizationClient()],
});
