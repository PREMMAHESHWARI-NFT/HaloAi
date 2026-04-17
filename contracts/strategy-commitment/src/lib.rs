#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, Address, Bytes, BytesN, Env,
};

// ─── Storage keys ────────────────────────────────────────────────────────────

#[contracttype]
pub enum DataKey {
    NextId,
    Commitment(u64),
    // Proof attachments
    NextProofId,
    Proof(u64),
    ProofByCommit(u64),
}

// ─── Stored commitment record ────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct CommitmentRecord {
    pub owner: Address,
    pub commitment: BytesN<32>,
    pub revealed: bool,
    pub strategy: Bytes,
    pub timestamp: u64,
}

// ─── Proof attachment record ─────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub struct ProofRecord {
    pub owner: Address,
    pub proof_hash: BytesN<32>,
    pub commit_id: u64,
    pub tx_hash: Bytes,
    pub revealed: bool,
    pub strategy: Bytes,
    pub trade_params: Bytes,
    pub timestamp: u64,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    NotFound = 1,
    AlreadyRevealed = 2,
    NotOwner = 3,
    HashMismatch = 4,
    CommitNotFound = 5,
    ProofNotFound = 6,
    ProofAlreadyRevealed = 7,
    ProofHashMismatch = 8,
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct StrategyCommitment;

#[contractimpl]
impl StrategyCommitment {
    /// Commit a strategy hash on-chain. Returns the commit_id.
    ///
    /// `commitment` = SHA-256(strategy_bytes || salt_bytes), computed off-chain.
    pub fn commit(env: Env, owner: Address, commitment: BytesN<32>) -> u64 {
        owner.require_auth();

        // Auto-increment ID
        let id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextId)
            .unwrap_or(0);

        let record = CommitmentRecord {
            owner: owner.clone(),
            commitment,
            revealed: false,
            strategy: Bytes::new(&env),
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Commitment(id), &record);

        env.storage()
            .instance()
            .set(&DataKey::NextId, &(id + 1));

        // Emit event
        env.events()
            .publish((symbol_short!("commit"),), (id, owner));

        id
    }

    /// Read a commitment record by ID.
    pub fn get(env: Env, commit_id: u64) -> CommitmentRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Commitment(commit_id))
            .unwrap_or_else(|| panic!("commitment not found"))
    }

    /// Reveal: prove that hash(strategy || salt) == commitment.
    ///
    /// On success, stores the plaintext strategy in the record and marks revealed.
    pub fn reveal(env: Env, commit_id: u64, strategy: Bytes, salt: Bytes) {
        let mut record: CommitmentRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Commitment(commit_id))
            .unwrap_or_else(|| panic!("commitment not found"));

        // Only the owner can reveal
        record.owner.require_auth();

        if record.revealed {
            panic!("already revealed");
        }

        // Reconstruct: hash(strategy || salt)
        let mut preimage = Bytes::new(&env);
        preimage.append(&strategy);
        preimage.append(&salt);

        let computed: BytesN<32> = env.crypto().sha256(&preimage).into();

        if computed != record.commitment {
            panic!("hash mismatch");
        }

        record.revealed = true;
        record.strategy = strategy;

        env.storage()
            .persistent()
            .set(&DataKey::Commitment(commit_id), &record);

        // Emit event
        env.events()
            .publish((symbol_short!("reveal"),), (commit_id, record.owner));
    }

    // ─── Proof Attachments ──────────────────────────────────────────────

    /// Attach a proof hash on-chain, linked to an existing commitment and a trade tx.
    ///
    /// `proof_hash` = SHA-256(strategy || trade_params || salt), computed off-chain.
    /// Returns the proof_id.
    pub fn attach_proof(
        env: Env,
        owner: Address,
        proof_hash: BytesN<32>,
        commit_id: u64,
        tx_hash: Bytes,
    ) -> u64 {
        owner.require_auth();

        // Validate the commitment exists and belongs to the caller
        let commit: CommitmentRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Commitment(commit_id))
            .unwrap_or_else(|| panic!("commitment not found"));

        if commit.owner != owner {
            panic!("not owner");
        }

        // Auto-increment proof ID
        let proof_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextProofId)
            .unwrap_or(0);

        let record = ProofRecord {
            owner: owner.clone(),
            proof_hash,
            commit_id,
            tx_hash,
            revealed: false,
            strategy: Bytes::new(&env),
            trade_params: Bytes::new(&env),
            timestamp: env.ledger().timestamp(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::Proof(proof_id), &record);

        env.storage()
            .persistent()
            .set(&DataKey::ProofByCommit(commit_id), &proof_id);

        env.storage()
            .instance()
            .set(&DataKey::NextProofId, &(proof_id + 1));

        env.events()
            .publish((symbol_short!("proof"),), (proof_id, owner, commit_id));

        proof_id
    }

    /// Read a proof record by ID.
    pub fn get_proof(env: Env, proof_id: u64) -> ProofRecord {
        env.storage()
            .persistent()
            .get(&DataKey::Proof(proof_id))
            .unwrap_or_else(|| panic!("proof not found"))
    }

    /// Reveal a proof: prove that hash(strategy || trade_params || salt) == proof_hash.
    ///
    /// On success, stores plaintext strategy and trade_params, marks revealed.
    pub fn reveal_proof(
        env: Env,
        proof_id: u64,
        strategy: Bytes,
        trade_params: Bytes,
        salt: Bytes,
    ) {
        let mut record: ProofRecord = env
            .storage()
            .persistent()
            .get(&DataKey::Proof(proof_id))
            .unwrap_or_else(|| panic!("proof not found"));

        record.owner.require_auth();

        if record.revealed {
            panic!("already revealed");
        }

        // Reconstruct: hash(strategy || trade_params || salt)
        let mut preimage = Bytes::new(&env);
        preimage.append(&strategy);
        preimage.append(&trade_params);
        preimage.append(&salt);

        let computed: BytesN<32> = env.crypto().sha256(&preimage).into();

        if computed != record.proof_hash {
            panic!("proof hash mismatch");
        }

        record.revealed = true;
        record.strategy = strategy;
        record.trade_params = trade_params;

        env.storage()
            .persistent()
            .set(&DataKey::Proof(proof_id), &record);

        env.events()
            .publish((symbol_short!("p_reveal"),), (proof_id, record.owner));
    }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};

    #[test]
    fn test_commit_get_reveal() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StrategyCommitment);
        let client = StrategyCommitmentClient::new(&env, &contract_id);

        let owner = Address::generate(&env);

        // Build commitment off-chain: sha256(strategy || salt)
        let strategy = Bytes::from_slice(&env, b"buy XLM when RSI < 30");
        let salt = Bytes::from_slice(&env, b"random_salt_1234");

        let mut preimage = Bytes::new(&env);
        preimage.append(&strategy);
        preimage.append(&salt);
        let commitment: BytesN<32> = env.crypto().sha256(&preimage).into();

        // 1. Commit
        let id = client.commit(&owner, &commitment);
        assert_eq!(id, 0);

        // 2. Get
        let record = client.get(&id);
        assert_eq!(record.owner, owner);
        assert_eq!(record.commitment, commitment);
        assert!(!record.revealed);

        // 3. Reveal
        client.reveal(&id, &strategy, &salt);

        let revealed = client.get(&id);
        assert!(revealed.revealed);
        assert_eq!(revealed.strategy, strategy);
    }

    #[test]
    #[should_panic(expected = "hash mismatch")]
    fn test_bad_reveal() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StrategyCommitment);
        let client = StrategyCommitmentClient::new(&env, &contract_id);

        let owner = Address::generate(&env);

        let strategy = Bytes::from_slice(&env, b"buy XLM when RSI < 30");
        let salt = Bytes::from_slice(&env, b"random_salt_1234");

        let mut preimage = Bytes::new(&env);
        preimage.append(&strategy);
        preimage.append(&salt);
        let commitment: BytesN<32> = env.crypto().sha256(&preimage).into();

        let id = client.commit(&owner, &commitment);

        // Try reveal with wrong salt
        let bad_salt = Bytes::from_slice(&env, b"wrong_salt");
        client.reveal(&id, &strategy, &bad_salt);
    }

    #[test]
    fn test_attach_and_get_proof() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StrategyCommitment);
        let client = StrategyCommitmentClient::new(&env, &contract_id);

        let owner = Address::generate(&env);

        // First create a commitment
        let strategy = Bytes::from_slice(&env, b"buy XLM when RSI < 30");
        let salt = Bytes::from_slice(&env, b"random_salt_1234");
        let mut preimage = Bytes::new(&env);
        preimage.append(&strategy);
        preimage.append(&salt);
        let commitment: BytesN<32> = env.crypto().sha256(&preimage).into();
        let commit_id = client.commit(&owner, &commitment);

        // Build proof hash: sha256(strategy || trade_params || proof_salt)
        let trade_params = Bytes::from_slice(&env, b"buy:XLM:100");
        let proof_salt = Bytes::from_slice(&env, b"proof_salt_5678");
        let mut proof_preimage = Bytes::new(&env);
        proof_preimage.append(&strategy);
        proof_preimage.append(&trade_params);
        proof_preimage.append(&proof_salt);
        let proof_hash: BytesN<32> = env.crypto().sha256(&proof_preimage).into();

        let tx_hash = Bytes::from_slice(&env, b"abc123txhash");

        // Attach proof
        let proof_id = client.attach_proof(&owner, &proof_hash, &commit_id, &tx_hash);
        assert_eq!(proof_id, 0);

        // Get proof
        let record = client.get_proof(&proof_id);
        assert_eq!(record.owner, owner);
        assert_eq!(record.proof_hash, proof_hash);
        assert_eq!(record.commit_id, commit_id);
        assert!(!record.revealed);
    }

    #[test]
    fn test_reveal_proof() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StrategyCommitment);
        let client = StrategyCommitmentClient::new(&env, &contract_id);

        let owner = Address::generate(&env);

        // Create commitment
        let commitment: BytesN<32> = BytesN::from_array(&env, &[1u8; 32]);
        let commit_id = client.commit(&owner, &commitment);

        // Build proof
        let strategy = Bytes::from_slice(&env, b"buy XLM when RSI < 30");
        let trade_params = Bytes::from_slice(&env, b"buy:XLM:100");
        let proof_salt = Bytes::from_slice(&env, b"proof_salt_5678");
        let mut proof_preimage = Bytes::new(&env);
        proof_preimage.append(&strategy);
        proof_preimage.append(&trade_params);
        proof_preimage.append(&proof_salt);
        let proof_hash: BytesN<32> = env.crypto().sha256(&proof_preimage).into();

        let tx_hash = Bytes::from_slice(&env, b"abc123txhash");
        let proof_id = client.attach_proof(&owner, &proof_hash, &commit_id, &tx_hash);

        // Reveal
        client.reveal_proof(&proof_id, &strategy, &trade_params, &proof_salt);

        let record = client.get_proof(&proof_id);
        assert!(record.revealed);
        assert_eq!(record.strategy, strategy);
        assert_eq!(record.trade_params, trade_params);
    }

    #[test]
    #[should_panic(expected = "proof hash mismatch")]
    fn test_bad_reveal_proof() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StrategyCommitment);
        let client = StrategyCommitmentClient::new(&env, &contract_id);

        let owner = Address::generate(&env);

        let commitment: BytesN<32> = BytesN::from_array(&env, &[1u8; 32]);
        let commit_id = client.commit(&owner, &commitment);

        let strategy = Bytes::from_slice(&env, b"buy XLM when RSI < 30");
        let trade_params = Bytes::from_slice(&env, b"buy:XLM:100");
        let proof_salt = Bytes::from_slice(&env, b"proof_salt_5678");
        let mut proof_preimage = Bytes::new(&env);
        proof_preimage.append(&strategy);
        proof_preimage.append(&trade_params);
        proof_preimage.append(&proof_salt);
        let proof_hash: BytesN<32> = env.crypto().sha256(&proof_preimage).into();

        let tx_hash = Bytes::from_slice(&env, b"abc123txhash");
        let proof_id = client.attach_proof(&owner, &proof_hash, &commit_id, &tx_hash);

        // Reveal with wrong salt
        let bad_salt = Bytes::from_slice(&env, b"wrong_salt");
        client.reveal_proof(&proof_id, &strategy, &trade_params, &bad_salt);
    }

    #[test]
    fn test_multiple_commits() {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, StrategyCommitment);
        let client = StrategyCommitmentClient::new(&env, &contract_id);

        let owner = Address::generate(&env);
        let commitment: BytesN<32> = BytesN::from_array(&env, &[1u8; 32]);

        let id0 = client.commit(&owner, &commitment);
        let id1 = client.commit(&owner, &commitment);
        let id2 = client.commit(&owner, &commitment);

        assert_eq!(id0, 0);
        assert_eq!(id1, 1);
        assert_eq!(id2, 2);
    }
}
