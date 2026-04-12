module shelby_share::file_share {
    use std::string::String;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::AptosCoin;
    use std::signer;
    use aptos_std::table::{Self, Table};

    struct FileRecord has store, drop {
        owner: address,
        price: u64,
        cid: String,
        locked: bool,
    }

    struct FileRegistry has key {
        files: Table<String, FileRecord>,
    }

    /// Registers a file on-chain for the calling account
    public entry fun publish_file(account: &signer, cid: String, price: u64, locked: bool) acquires FileRegistry {
        let owner_addr = signer::address_of(account);
        if (!exists<FileRegistry>(owner_addr)) {
            move_to(account, FileRegistry {
                files: table::new(),
            });
        };
        
        let registry = borrow_global_mut<FileRegistry>(owner_addr);
        let record = FileRecord {
            owner: owner_addr,
            price,
            cid: cid,
            locked,
        };
        table::upsert(&mut registry.files, cid, record);
    }

    /// Mocks unlocking a file by transferring the required APT fee to the file's owner
    public entry fun unlock_file(account: &signer, registry_owner: address, cid: String) acquires FileRegistry {
        let registry = borrow_global<FileRegistry>(registry_owner);
        let record = table::borrow(&registry.files, cid);
        
        // Error code 1 if file is not actually locked or doesn't require payment
        assert!(record.locked, 1);
        
        if (record.price > 0) {
            coin::transfer<AptosCoin>(account, record.owner, record.price);
        }
    }
}
