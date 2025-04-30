"""
Solana transaction builder for the your.fun Python SDK.
Handles instruction creation, PDA derivation, and transaction serialization.
"""

from __future__ import annotations
import hashlib
import struct
from typing import Optional

from solders.pubkey import Pubkey
from solders.system_program import ID as SYSTEM_PROGRAM_ID
from solders.instruction import Instruction, AccountMeta
from solders.transaction import Transaction
from solders.message import Message
from solders.hash import Hash as Blockhash
from solana.rpc.async_api import AsyncClient


PROGRAM_ID = Pubkey.from_string("YRFunHP2kVerify1111111111111111111111111111")

SEED_REGISTRY = b"registry"
SEED_HUMAN = b"human"
SEED_SESSION = b"session"
SEED_INTERACTION = b"interaction"


class SolanaClient:
    """
    Solana transaction builder and account reader for the your.fun program.

    Usage:
        client = SolanaClient()
        status = await client.get_verification_status(wallet_str)
    """

    def __init__(
        self,
        rpc_url: str = "https://api.devnet.solana.com",
        program_id: Optional[Pubkey] = None,
    ) -> None:
        self._rpc = AsyncClient(rpc_url)
        self._program_id = program_id or PROGRAM_ID

    # -- PDA Derivation --

    def derive_registry_address(self) -> tuple[Pubkey, int]:
        return Pubkey.find_program_address([SEED_REGISTRY], self._program_id)

    def derive_human_record_address(self, wallet: Pubkey) -> tuple[Pubkey, int]:
        return Pubkey.find_program_address(
            [SEED_HUMAN, bytes(wallet)], self._program_id
        )

    def derive_session_address(
        self, human_record: Pubkey, session_index: int
    ) -> tuple[Pubkey, int]:
        index_bytes = struct.pack("<Q", session_index)
        return Pubkey.find_program_address(
            [SEED_SESSION, bytes(human_record), index_bytes], self._program_id
        )

    def derive_interaction_address(
        self, session: Pubkey, interaction_index: int
    ) -> tuple[Pubkey, int]:
        index_bytes = struct.pack("<I", interaction_index)
        return Pubkey.find_program_address(
            [SEED_INTERACTION, bytes(session), index_bytes], self._program_id
        )

    # -- Transaction Builders --

    async def build_register_human_tx(
        self,
        wallet: Pubkey,
        challenge_nonce: bytes,
        fingerprint_hash: bytes,
    ) -> Transaction:
        """Builds a register_human transaction."""
        registry_addr, _ = self.derive_registry_address()
        human_record_addr, _ = self.derive_human_record_address(wallet)

        registry_info = await self._rpc.get_account_info(registry_addr)
        if not registry_info.value:
            raise ValueError("Platform registry not initialized")

        authority_bytes = registry_info.value.data[8:40]
        authority = Pubkey.from_bytes(authority_bytes)

        discriminator = self._compute_discriminator("register_human")
        data = discriminator + challenge_nonce + fingerprint_hash

        ix = Instruction(
            program_id=self._program_id,
            accounts=[
                AccountMeta(registry_addr, is_signer=False, is_writable=True),
                AccountMeta(human_record_addr, is_signer=False, is_writable=True),
                AccountMeta(wallet, is_signer=True, is_writable=True),
                AccountMeta(authority, is_signer=False, is_writable=True),
                AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            ],
            data=data,
        )

        blockhash_resp = await self._rpc.get_latest_blockhash()
        recent_blockhash = blockhash_resp.value.blockhash

        msg = Message.new_with_blockhash([ix], wallet, recent_blockhash)
        return Transaction.new_unsigned(msg)

    async def build_create_session_tx(
        self,
        wallet: Pubkey,
        personality_id: int,
        initial_topic: bytes,
    ) -> tuple[Transaction, Pubkey]:
        """Builds a create_session transaction. Returns (tx, session_address)."""
        registry_addr, _ = self.derive_registry_address()
        human_record_addr, _ = self.derive_human_record_address(wallet)

        human_info = await self._rpc.get_account_info(human_record_addr)
        if not human_info.value:
            raise ValueError("Human record not found for this wallet")

        offset = 8 + 32 + 32 + 8 + 1 + 32 + 1
        session_count = struct.unpack_from("<Q", human_info.value.data, offset)[0]

        session_addr, _ = self.derive_session_address(human_record_addr, session_count)

        discriminator = self._compute_discriminator("create_session")
        data = discriminator + bytes([personality_id]) + initial_topic

        ix = Instruction(
            program_id=self._program_id,
            accounts=[
                AccountMeta(registry_addr, is_signer=False, is_writable=True),
                AccountMeta(human_record_addr, is_signer=False, is_writable=True),
                AccountMeta(session_addr, is_signer=False, is_writable=True),
                AccountMeta(wallet, is_signer=True, is_writable=True),
                AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            ],
            data=data,
        )

        blockhash_resp = await self._rpc.get_latest_blockhash()
        recent_blockhash = blockhash_resp.value.blockhash

        msg = Message.new_with_blockhash([ix], wallet, recent_blockhash)
        return Transaction.new_unsigned(msg), session_addr

    async def build_record_interaction_tx(
        self,
        wallet: Pubkey,
        session_addr: Pubkey,
        session_index: int,
        content_hash: bytes,
        interaction_type: int,
        score: int,
        duration_seconds: int,
    ) -> Transaction:
        """Builds a record_interaction transaction."""
        registry_addr, _ = self.derive_registry_address()
        human_record_addr, _ = self.derive_human_record_address(wallet)

        session_info = await self._rpc.get_account_info(session_addr)
        if not session_info.value:
            raise ValueError("Session account not found")

        interaction_count_offset = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 1
        interaction_count = struct.unpack_from(
            "<I", session_info.value.data, interaction_count_offset
        )[0]

        interaction_addr, _ = self.derive_interaction_address(
            session_addr, interaction_count
        )

        discriminator = self._compute_discriminator("record_interaction")
        data = (
            discriminator
            + content_hash
            + bytes([interaction_type])
            + bytes([score])
            + struct.pack("<I", duration_seconds)
        )

        ix = Instruction(
            program_id=self._program_id,
            accounts=[
                AccountMeta(registry_addr, is_signer=False, is_writable=True),
                AccountMeta(human_record_addr, is_signer=False, is_writable=True),
                AccountMeta(session_addr, is_signer=False, is_writable=True),
                AccountMeta(interaction_addr, is_signer=False, is_writable=True),
                AccountMeta(wallet, is_signer=True, is_writable=True),
                AccountMeta(SYSTEM_PROGRAM_ID, is_signer=False, is_writable=False),
            ],
            data=data,
        )

        blockhash_resp = await self._rpc.get_latest_blockhash()
        recent_blockhash = blockhash_resp.value.blockhash

        msg = Message.new_with_blockhash([ix], wallet, recent_blockhash)
        return Transaction.new_unsigned(msg)

    # -- Account Readers --

    async def get_verification_status(self, wallet_str: str) -> dict:
        """Reads the on-chain verification status for a wallet."""
        wallet = Pubkey.from_string(wallet_str)
        human_record_addr, _ = self.derive_human_record_address(wallet)

        info = await self._rpc.get_account_info(human_record_addr)
        if not info.value:
            return {
                "is_registered": False,
                "is_verified": False,
                "verification_level": 0,
                "verified_at": None,
                "session_count": 0,
                "total_interactions": 0,
                "learning_score": 0,
            }

        data = info.value.data
        offset = 8 + 32 + 32

        verified_at = struct.unpack_from("<q", data, offset)[0]
        offset += 8

        verification_level = data[offset]
        offset += 1 + 32

        is_active = data[offset] == 1
        offset += 1

        session_count = struct.unpack_from("<Q", data, offset)[0]
        offset += 8

        total_interactions = struct.unpack_from("<Q", data, offset)[0]
        offset += 8 + 8

        learning_score = struct.unpack_from("<Q", data, offset)[0]

        return {
            "is_registered": True,
            "is_verified": is_active,
            "verification_level": verification_level,
            "verified_at": verified_at if verified_at > 0 else None,
            "session_count": session_count,
            "total_interactions": total_interactions,
            "learning_score": learning_score,
        }

    async def get_platform_stats(self) -> dict:
        """Reads global platform statistics from the registry."""
        registry_addr, _ = self.derive_registry_address()
        info = await self._rpc.get_account_info(registry_addr)

        if not info.value:
            raise ValueError("Platform registry not found")

        data = info.value.data
        offset = 8 + 32 + 8

        total_verified = struct.unpack_from("<Q", data, offset)[0]
        offset += 8
        total_sessions = struct.unpack_from("<Q", data, offset)[0]
        offset += 8
        total_interactions = struct.unpack_from("<Q", data, offset)[0]
        offset += 8
        is_paused = data[offset] == 1

        return {
            "total_verified_humans": total_verified,
            "total_sessions_created": total_sessions,
            "total_interactions": total_interactions,
            "is_paused": is_paused,
        }

    async def close(self) -> None:
        """Closes the RPC client."""
        await self._rpc.close()

    # -- Private helpers --

    @staticmethod
    def _compute_discriminator(name: str) -> bytes:
        full = f"global:{name}"
        return hashlib.sha256(full.encode("utf-8")).digest()[:8]
