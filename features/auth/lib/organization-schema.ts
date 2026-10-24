export const organizationAdditionalFields = {
  isRoot: {
    type: "boolean",
    input: false,
    required: true,
    defaultValue: false,
  },
  status: {
    type: ["active", "suspended", "deleted"] as [
      "active",
      "suspended",
      "deleted",
    ],
    input: false,
    required: true,
    defaultValue: "active",
  },
  color: {
    type: "string",
    required: false,
  },
  backgroundImage: {
    type: "string",
    required: false,
  },
  favicon: {
    type: "string",
    required: false,
  },
  allowPublicSignUp: {
    type: "boolean",
    input: false,
    required: true,
    defaultValue: false,
  },
  requireTwoFactor: {
    type: "boolean",
    input: false,
    required: true,
    defaultValue: false,
  },
} as const
