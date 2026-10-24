import { parseAsStringLiteral } from "nuqs/server"

import { ACCOUNT_NOTICES, ACCOUNT_SECTIONS } from "@/features/account/types"

// The account dialog lives in the URL so any page can link straight into one
// of its sections: `?account=<section>` opens it there, and an absent or
// unknown value leaves it closed. `?accountNotice=` carries a one-shot status
// from another page, such as a completed address change, and is cleared once
// it has been shown.
export const accountSearchParams = {
  account: parseAsStringLiteral(ACCOUNT_SECTIONS),
  accountNotice: parseAsStringLiteral(ACCOUNT_NOTICES),
}
