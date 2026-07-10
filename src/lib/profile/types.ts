export type ProfileField =
  | "fullName"
  | "currentJobSituation"
  | "employmentObjective"
  | "primaryRole"
  | "preferredLocation"
  | "contractPreference"
  | "workRate"
  | "workPermitStatus"
  | "salaryExpectation";

export type QualificationCategory = "skill" | "diploma" | "certification" | "qualification";

export type ProfileIntent =
  | {
      field: ProfileField;
      value: string;
      operation: "set";
    }
  | {
      field: "salaryExpectation";
      operation: "clear";
    }
  | {
      field: "qualifications";
      operation: "addItem";
      category: QualificationCategory;
      value: string;
    }
  | {
      field: "qualifications";
      operation: "removeItem";
      category: QualificationCategory;
      value: string;
    };

export type ProfileChangeSetEntry = {
  kind: "profile_field" | "qualification_item";
  field?: ProfileField;
  operation: string;
  category?: QualificationCategory;
  value?: string | null;
  previousValue?: string | null;
};

export type ConfirmedChatContext = {
  confirmationId: string;
  source: "chat_confirmed";
};
