import { betterAuth } from "better-auth/minimal";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";
import { organization } from "better-auth/plugins";

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: "pg",
    }),
    plugins: [
        organization(
            {schema: {
             organization : {
                additionalFields: {
                    isRoot: {
                        type: "boolean",
                        input: false,
                        required: true,
                        defaultValue: false
                    }
                }
             }   
            }}
        )
    ]
});