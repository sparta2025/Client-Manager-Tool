export type LocalUserProvisioningProfile = {
  displayName: string | null;
  email: string | null;
};

export type LocalUserProvisioningRecord = LocalUserProvisioningProfile & {
  id: number;
  clerkUserId: string;
  role: "admin" | "lawyer" | "assistant";
  status: "active" | "pending" | "disabled";
};

export type LocalUserProvisioningTransaction<User extends LocalUserProvisioningRecord> = {
  lockInitialRegistration(): Promise<void>;
  findByClerkUserId(clerkUserId: string): Promise<User | undefined>;
  countUsers(): Promise<number>;
  createUser(
    user: LocalUserProvisioningProfile & {
      clerkUserId: string;
      role: "admin" | "lawyer";
      status: "active" | "pending";
    },
  ): Promise<User>;
  createAccessRequestNotification(requesterId: number): Promise<void>;
};

export type LocalUserProvisioningStore<User extends LocalUserProvisioningRecord> = {
  findByClerkUserId(clerkUserId: string): Promise<User | undefined>;
  updateProfile(
    id: number,
    changes: Partial<LocalUserProvisioningProfile>,
  ): Promise<User>;
  transaction<Result>(
    callback: (transaction: LocalUserProvisioningTransaction<User>) => Promise<Result>,
  ): Promise<Result>;
};

export function createEnsureLocalUser<User extends LocalUserProvisioningRecord>(
  store: LocalUserProvisioningStore<User>,
): (clerkUserId: string, profile: LocalUserProvisioningProfile) => Promise<User> {
  return async (clerkUserId, profile) => {
    const existing = await store.findByClerkUserId(clerkUserId);

    if (existing) {
      const changes: Partial<LocalUserProvisioningProfile> = {};
      if (profile.displayName && profile.displayName !== existing.displayName) {
        changes.displayName = profile.displayName;
      }
      if (profile.email && profile.email !== existing.email) {
        changes.email = profile.email;
      }
      if (Object.keys(changes).length > 0) {
        return store.updateProfile(existing.id, changes);
      }
      return existing;
    }

    return store.transaction(async (transaction) => {
      await transaction.lockInitialRegistration();

      const concurrentUser = await transaction.findByClerkUserId(clerkUserId);
      if (concurrentUser) return concurrentUser;

      const isFirstUser = (await transaction.countUsers()) === 0;
      const user = await transaction.createUser({
        clerkUserId,
        displayName: profile.displayName,
        email: profile.email,
        role: isFirstUser ? "admin" : "lawyer",
        status: isFirstUser ? "active" : "pending",
      });
      if (user.status === "pending") {
        await transaction.createAccessRequestNotification(user.id);
      }
      return user;
    });
  };
}
