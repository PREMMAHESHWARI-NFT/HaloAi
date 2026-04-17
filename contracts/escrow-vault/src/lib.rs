#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror, token, Address, Env, String, Symbol,
};

// ─── Storage keys ───────────────────────────────────────────────────────────

#[contracttype]
enum DataKey {
    Owner,                            // Address — contract-level owner
    Balance(Address, Address),        // (owner, token) → i128
    Lock(Address, u64),               // (owner, lock_id) → LockEntry
    NextLockId(Address),              // owner → u64
}

// ─── Lock entry stored on-chain ─────────────────────────────────────────────

#[derive(Clone, Debug, PartialEq)]
#[contracttype]
pub enum LockStatus {
    Active,
    Released,
    Expired,
}

#[derive(Clone, Debug)]
#[contracttype]
pub struct LockEntry {
    pub token: Address,
    pub amount: i128,
    pub expires_at: u64,
    pub status: LockStatus,
}

// ─── Errors ─────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaultError {
    AlreadyInitialized = 1,
    NotInitialized     = 2,
    NotOwner           = 3,
    InsufficientFunds  = 4,
    InvalidAmount      = 5,
    LockNotFound       = 6,
    LockNotActive      = 7,
    LockExpired        = 8,
    LockNotExpired     = 9,
    InvalidExpiry      = 10,
}

// ─── Contract ───────────────────────────────────────────────────────────────

#[contract]
pub struct EscrowVault;

#[contractimpl]
impl EscrowVault {
    /// Initialize the vault with a contract-level owner.
    /// Can only be called once.
    pub fn init(env: Env, owner: Address) -> Result<(), VaultError> {
        if env.storage().instance().has(&DataKey::Owner) {
            return Err(VaultError::AlreadyInitialized);
        }
        owner.require_auth();
        env.storage().instance().set(&DataKey::Owner, &owner);
        // Bump instance TTL to ~30 days (ledgers ≈ 5s each)
        env.storage().instance().extend_ttl(518_400, 518_400);
        env.events().publish((Symbol::new(&env, "init"),), owner);
        Ok(())
    }

    /// Deposit `amount` of `token` into the vault on behalf of `owner`.
    /// The caller must be `owner` (require_auth).
    pub fn deposit(
        env: Env,
        owner: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), VaultError> {
        Self::require_init(&env)?;
        owner.require_auth();
        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }

        // Transfer tokens from owner → this contract
        let client = token::Client::new(&env, &token);
        client.transfer(&owner, &env.current_contract_address(), &amount);

        // Credit internal balance
        let key = DataKey::Balance(owner.clone(), token.clone());
        let prev: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(prev + amount));
        env.storage().persistent().extend_ttl(&key, 518_400, 518_400);

        env.events().publish(
            (Symbol::new(&env, "deposit"), owner, token),
            amount,
        );
        Ok(())
    }

    /// Withdraw unlocked `amount` of `token` back to `owner`.
    pub fn withdraw(
        env: Env,
        owner: Address,
        token: Address,
        amount: i128,
    ) -> Result<(), VaultError> {
        Self::require_init(&env)?;
        owner.require_auth();
        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }

        let key = DataKey::Balance(owner.clone(), token.clone());
        let balance: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if balance < amount {
            return Err(VaultError::InsufficientFunds);
        }

        // Transfer tokens from contract → owner
        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &owner, &amount);

        env.storage().persistent().set(&key, &(balance - amount));
        env.storage().persistent().extend_ttl(&key, 518_400, 518_400);

        env.events().publish(
            (Symbol::new(&env, "withdraw"), owner, token),
            amount,
        );
        Ok(())
    }

    /// Lock `amount` of `token` from `owner`'s deposited balance.
    /// Creates an on-chain LockEntry with `expires_at` ledger sequence.
    /// Returns the assigned lock_id.
    pub fn lock(
        env: Env,
        owner: Address,
        token: Address,
        amount: i128,
        expires_at: u64,
    ) -> Result<u64, VaultError> {
        Self::require_init(&env)?;
        owner.require_auth();
        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }
        let current_ledger = env.ledger().sequence() as u64;
        if expires_at <= current_ledger {
            return Err(VaultError::InvalidExpiry);
        }

        // Deduct from available balance
        let bal_key = DataKey::Balance(owner.clone(), token.clone());
        let balance: i128 = env.storage().persistent().get(&bal_key).unwrap_or(0);
        if balance < amount {
            return Err(VaultError::InsufficientFunds);
        }
        env.storage().persistent().set(&bal_key, &(balance - amount));
        env.storage().persistent().extend_ttl(&bal_key, 518_400, 518_400);

        // Assign sequential lock_id
        let id_key = DataKey::NextLockId(owner.clone());
        let lock_id: u64 = env.storage().persistent().get(&id_key).unwrap_or(0);
        env.storage().persistent().set(&id_key, &(lock_id + 1));

        // Store the lock
        let entry = LockEntry {
            token: token.clone(),
            amount,
            expires_at,
            status: LockStatus::Active,
        };
        let lock_key = DataKey::Lock(owner.clone(), lock_id);
        env.storage().persistent().set(&lock_key, &entry);
        env.storage().persistent().extend_ttl(&lock_key, 518_400, 518_400);

        env.events().publish(
            (Symbol::new(&env, "lock"), owner, token),
            (lock_id, amount, expires_at),
        );
        Ok(lock_id)
    }

    /// Release a locked escrow to `recipient`.
    /// Only the lock owner can release, and only while the lock is active
    /// and not yet expired.
    pub fn release(
        env: Env,
        owner: Address,
        lock_id: u64,
        recipient: Address,
    ) -> Result<(), VaultError> {
        Self::require_init(&env)?;
        owner.require_auth();

        let lock_key = DataKey::Lock(owner.clone(), lock_id);
        let mut entry: LockEntry = env
            .storage()
            .persistent()
            .get(&lock_key)
            .ok_or(VaultError::LockNotFound)?;

        if entry.status != LockStatus::Active {
            return Err(VaultError::LockNotActive);
        }
        let current_ledger = env.ledger().sequence() as u64;
        if current_ledger > entry.expires_at {
            // Mark expired so future calls see the right status
            entry.status = LockStatus::Expired;
            env.storage().persistent().set(&lock_key, &entry);
            return Err(VaultError::LockExpired);
        }

        // Transfer tokens from contract → recipient
        let client = token::Client::new(&env, &entry.token);
        client.transfer(
            &env.current_contract_address(),
            &recipient,
            &entry.amount,
        );

        entry.status = LockStatus::Released;
        env.storage().persistent().set(&lock_key, &entry);
        env.storage().persistent().extend_ttl(&lock_key, 518_400, 518_400);

        env.events().publish(
            (Symbol::new(&env, "release"), owner),
            (lock_id, recipient, entry.amount),
        );
        Ok(())
    }

    /// Reclaim funds from an expired lock back to the owner's balance.
    /// Anyone can call this, but funds return to the original lock owner.
    pub fn reclaim(
        env: Env,
        owner: Address,
        lock_id: u64,
    ) -> Result<(), VaultError> {
        Self::require_init(&env)?;
        owner.require_auth();

        let lock_key = DataKey::Lock(owner.clone(), lock_id);
        let mut entry: LockEntry = env
            .storage()
            .persistent()
            .get(&lock_key)
            .ok_or(VaultError::LockNotFound)?;

        if entry.status != LockStatus::Active {
            return Err(VaultError::LockNotActive);
        }
        let current_ledger = env.ledger().sequence() as u64;
        if current_ledger <= entry.expires_at {
            return Err(VaultError::LockNotExpired);
        }

        // Return to owner's balance
        let bal_key = DataKey::Balance(owner.clone(), entry.token.clone());
        let balance: i128 = env.storage().persistent().get(&bal_key).unwrap_or(0);
        env.storage().persistent().set(&bal_key, &(balance + entry.amount));

        entry.status = LockStatus::Expired;
        env.storage().persistent().set(&lock_key, &entry);

        env.events().publish(
            (Symbol::new(&env, "reclaim"), owner),
            (lock_id, entry.amount),
        );
        Ok(())
    }

    // ─── Read-only queries ──────────────────────────────────────────────

    /// Get the deposited (unlocked) balance for an owner+token pair.
    pub fn balance(env: Env, owner: Address, token: Address) -> i128 {
        let key = DataKey::Balance(owner, token);
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    /// Get a specific lock entry.
    pub fn get_lock(env: Env, owner: Address, lock_id: u64) -> Result<LockEntry, VaultError> {
        let key = DataKey::Lock(owner, lock_id);
        env.storage()
            .persistent()
            .get(&key)
            .ok_or(VaultError::LockNotFound)
    }

    /// Get the contract owner.
    pub fn owner(env: Env) -> Result<Address, VaultError> {
        env.storage()
            .instance()
            .get(&DataKey::Owner)
            .ok_or(VaultError::NotInitialized)
    }

    // ─── Internal ───────────────────────────────────────────────────────

    fn require_init(env: &Env) -> Result<(), VaultError> {
        if !env.storage().instance().has(&DataKey::Owner) {
            return Err(VaultError::NotInitialized);
        }
        env.storage().instance().extend_ttl(518_400, 518_400);
        Ok(())
    }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Ledger};
    use soroban_sdk::token::{StellarAssetClient, TokenClient};

    fn setup_token(env: &Env, admin: &Address) -> (Address, TokenClient, StellarAssetClient) {
        let addr = env.register_stellar_asset_contract_v2(admin.clone()).address();
        let client = TokenClient::new(env, &addr);
        let admin_client = StellarAssetClient::new(env, &addr);
        (addr, client, admin_client)
    }

    #[test]
    fn test_full_flow() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(EscrowVault, ());
        let client = EscrowVaultClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let recipient = Address::generate(&env);
        let admin = Address::generate(&env);

        // Setup token and mint to owner
        let (token_addr, token_client, token_admin) = setup_token(&env, &admin);
        token_admin.mint(&owner, &10_000);

        // Init vault
        client.init(&owner);
        assert_eq!(client.owner(), owner);

        // Deposit 5000
        client.deposit(&owner, &token_addr, &5_000);
        assert_eq!(client.balance(&owner, &token_addr), 5_000);
        assert_eq!(token_client.balance(&owner), 5_000);

        // Withdraw 1000
        client.withdraw(&owner, &token_addr, &1_000);
        assert_eq!(client.balance(&owner, &token_addr), 4_000);
        assert_eq!(token_client.balance(&owner), 6_000);

        // Lock 2000, expires at ledger 1000
        env.ledger().set_sequence_number(100);
        let lock_id = client.lock(&owner, &token_addr, &2_000, &1_000);
        assert_eq!(lock_id, 0);
        assert_eq!(client.balance(&owner, &token_addr), 2_000);

        // Verify lock entry
        let entry = client.get_lock(&owner, &lock_id);
        assert_eq!(entry.amount, 2_000);
        assert_eq!(entry.status, LockStatus::Active);

        // Release to recipient
        client.release(&owner, &lock_id, &recipient);
        assert_eq!(token_client.balance(&recipient), 2_000);

        let entry = client.get_lock(&owner, &lock_id);
        assert_eq!(entry.status, LockStatus::Released);
    }

    #[test]
    fn test_reclaim_expired() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(EscrowVault, ());
        let client = EscrowVaultClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let admin = Address::generate(&env);
        let (token_addr, _token_client, token_admin) = setup_token(&env, &admin);
        token_admin.mint(&owner, &5_000);

        client.init(&owner);
        client.deposit(&owner, &token_addr, &3_000);

        // Lock expires at ledger 200
        env.ledger().set_sequence_number(100);
        let lock_id = client.lock(&owner, &token_addr, &2_000, &200);

        // Advance past expiry
        env.ledger().set_sequence_number(201);

        // Reclaim expired funds
        client.reclaim(&owner, &lock_id);
        assert_eq!(client.balance(&owner, &token_addr), 3_000); // 1000 remaining + 2000 reclaimed

        let entry = client.get_lock(&owner, &lock_id);
        assert_eq!(entry.status, LockStatus::Expired);
    }

    #[test]
    #[should_panic(expected = "Error(Contract, #4)")]
    fn test_withdraw_insufficient() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register(EscrowVault, ());
        let client = EscrowVaultClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let admin = Address::generate(&env);
        let (token_addr, _token_client, token_admin) = setup_token(&env, &admin);
        token_admin.mint(&owner, &100);

        client.init(&owner);
        client.deposit(&owner, &token_addr, &100);
        client.withdraw(&owner, &token_addr, &200); // panics: InsufficientFunds
    }
}
