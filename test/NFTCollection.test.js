const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("NFTCollection", function () {
    let NFTCollection;
    let nftCollection;
    let owner;
    let addr1;
    let addr2;
    let addrs;

    const name = "Test NFT";
    const symbol = "TNFT";
    const description = "Test Description";
    const maxSupply = 1000;
    const mintPrice = ethers.parseEther("0.1");
    const imageUrl = "https://example.com/image.png";
    const whitelistOnly = false;
    const maxMintsPerWallet = 3;
    const mintStartTime = 0;  // No restriction by default
    const mintEndTime = 0;    // No restriction by default

    beforeEach(async function () {
        NFTCollection = await ethers.getContractFactory("NFTCollection");
        [owner, addr1, addr2, ...addrs] = await ethers.getSigners();

        const initialWhitelist = [addr1.address];
        nftCollection = await NFTCollection.deploy(
            name,
            symbol,
            description,
            maxSupply,
            mintPrice,
            owner.address,
            imageUrl,
            whitelistOnly,
            initialWhitelist,
            maxMintsPerWallet,
            mintStartTime,
            mintEndTime
        );
        await nftCollection.waitForDeployment();
    });

    describe("Deployment", function () {
        it("Should set the correct initial values", async function () {
            expect(await nftCollection.name()).to.equal(name);
            expect(await nftCollection.symbol()).to.equal(symbol);
            expect(await nftCollection.description()).to.equal(description);
            expect(await nftCollection.maxSupply()).to.equal(maxSupply);
            expect(await nftCollection.mintPrice()).to.equal(mintPrice);
            expect(await nftCollection.image()).to.equal(imageUrl);
            expect(await nftCollection.owner()).to.equal(owner.address);
            expect(await nftCollection.totalSupply()).to.equal(0);
            expect(await nftCollection.whitelistOnly()).to.equal(whitelistOnly);
            expect(await nftCollection.maxMintsPerWallet()).to.equal(maxMintsPerWallet);
        });

        it("Should initialize whitelist correctly", async function () {
            expect(await nftCollection.whitelist(addr1.address)).to.be.true;
            expect(await nftCollection.whitelist(addr2.address)).to.be.false;
            expect(await nftCollection.whitelistOnly()).to.be.false;
        });
    });

    describe("Minting", function () {
        it("Should allow minting with correct payment", async function () {
            await nftCollection.connect(addr1).mint({ value: mintPrice });
            expect(await nftCollection.totalSupply()).to.equal(1);
            expect(await nftCollection.ownerOf(0)).to.equal(addr1.address);
            expect(await nftCollection.mintsPerWallet(addr1.address)).to.equal(1);
        });

        it("Should fail when minting with insufficient payment", async function () {
            const lowPrice = ethers.parseEther("0.05");
            await expect(
                nftCollection.connect(addr1).mint({ value: lowPrice })
            ).to.be.revertedWith("Insufficient payment");
        });

        it("Should fail when max supply is reached", async function () {
            const smallMaxSupply = 2;
            const collection = await NFTCollection.deploy(
                name, symbol, description, smallMaxSupply, mintPrice,
                owner.address, imageUrl, whitelistOnly, [], maxMintsPerWallet,
                0, 0  // No time restrictions
            );

            await collection.connect(addr1).mint({ value: mintPrice });
            await collection.connect(addr1).mint({ value: mintPrice });

            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.be.revertedWith("Max supply reached");
        });

        it("Should respect max mints per wallet", async function () {
            const smallMaxMints = 2;
            const collection = await NFTCollection.deploy(
                name, symbol, description, maxSupply, mintPrice,
                owner.address, imageUrl, whitelistOnly, [], smallMaxMints,
                0, 0  // No time restrictions
            );

            await collection.connect(addr1).mint({ value: mintPrice });
            await collection.connect(addr1).mint({ value: mintPrice });

            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.be.revertedWith("Max mints per wallet reached");

            expect(await collection.mintsPerWallet(addr1.address)).to.equal(2);
            expect(await collection.remainingMints(addr1.address)).to.equal(0);
        });

        it("Should respect whitelist when enabled", async function () {
            await nftCollection.setWhitelistOnly(true);

            // addr1 is whitelisted, should succeed
            await expect(
                nftCollection.connect(addr1).mint({ value: mintPrice })
            ).to.not.be.reverted;

            // addr2 is not whitelisted, should fail
            await expect(
                nftCollection.connect(addr2).mint({ value: mintPrice })
            ).to.be.revertedWith("Not whitelisted");
        });
    });

    describe("Whitelist Management", function () {
        it("Should allow owner to add addresses to whitelist", async function () {
            const newAddresses = [addr2.address, addrs[0].address];
            await nftCollection.addToWhitelist(newAddresses);

            expect(await nftCollection.whitelist(addr2.address)).to.be.true;
            expect(await nftCollection.whitelist(addrs[0].address)).to.be.true;
        });

        it("Should allow owner to remove addresses from whitelist", async function () {
            const addresses = [addr1.address];
            await nftCollection.removeFromWhitelist(addresses);

            expect(await nftCollection.whitelist(addr1.address)).to.be.false;
        });

        it("Should emit events when modifying whitelist", async function () {
            const addresses = [addr2.address];

            await expect(nftCollection.addToWhitelist(addresses))
                .to.emit(nftCollection, "WhitelistAdded")
                .withArgs(addresses);

            await expect(nftCollection.removeFromWhitelist(addresses))
                .to.emit(nftCollection, "WhitelistRemoved")
                .withArgs(addresses);
        });

        it("Should not allow non-owner to modify whitelist", async function () {
            const addresses = [addr2.address];

            await expect(
                nftCollection.connect(addr1).addToWhitelist(addresses)
            ).to.be.revertedWithCustomError(nftCollection, "OwnableUnauthorizedAccount");

            await expect(
                nftCollection.connect(addr1).removeFromWhitelist(addresses)
            ).to.be.revertedWithCustomError(nftCollection, "OwnableUnauthorizedAccount");
        });
    });

    describe("Token URI", function () {
        it("Should generate correct token URI", async function () {
            await nftCollection.connect(addr1).mint({ value: mintPrice });
            const tokenURI = await nftCollection.tokenURI(0);

            expect(tokenURI).to.include("data:application/json;base64,");
            
            // Decode base64 and parse JSON
            const base64Data = tokenURI.split(",")[1];
            const jsonData = JSON.parse(
                Buffer.from(base64Data, "base64").toString()
            );
            expect(jsonData.name).to.equal(name);
            expect(jsonData.description).to.equal(description);
            expect(jsonData.image).to.equal(imageUrl);
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to update mint price", async function () {
            const newPrice = ethers.parseEther("0.2");
            await expect(nftCollection.setMintPrice(newPrice))
                .to.emit(nftCollection, "MintPriceUpdated")
                .withArgs(mintPrice, newPrice);

            expect(await nftCollection.mintPrice()).to.equal(newPrice);
        });

        it("Should allow owner to withdraw funds", async function () {
            // First mint an NFT to add funds to contract
            await nftCollection.connect(addr1).mint({ value: mintPrice });

            const initialBalance = await ethers.provider.getBalance(owner.address);
            await nftCollection.withdraw();
            const finalBalance = await ethers.provider.getBalance(owner.address);

            expect(finalBalance).to.be.gt(initialBalance);
        });

        it("Should allow owner to pause and unpause", async function () {
            await nftCollection.pause();
            
            await expect(
                nftCollection.connect(addr1).mint({ value: mintPrice })
            ).to.be.revertedWithCustomError(nftCollection, "EnforcedPause");

            await nftCollection.unpause();

            await expect(
                nftCollection.connect(addr1).mint({ value: mintPrice })
            ).to.not.be.reverted;
        });
    });

    describe("Minting Time Control", function () {
        it("Should respect start time restriction", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600; // 1 hour from now
            const endTime = startTime + 7200;     // 2 hours from start

            const collection = await NFTCollection.deploy(
                name, symbol, description, maxSupply, mintPrice,
                owner.address, imageUrl, whitelistOnly, [], maxMintsPerWallet,
                startTime, endTime
            );

            // Try minting before start time
            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.be.revertedWith("Minting not started");

            // Move time forward to after start time
            await time.increaseTo(startTime + 1);

            // Should be able to mint now
            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.not.be.reverted;
        });

        it("Should respect end time restriction", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;  // 1 hour from now
            const endTime = startTime + 7200;      // 2 hours from start

            const collection = await NFTCollection.deploy(
                name, symbol, description, maxSupply, mintPrice,
                owner.address, imageUrl, whitelistOnly, [], maxMintsPerWallet,
                startTime, endTime
            );

            // Move time to active period
            await time.increaseTo(startTime + 1);
            await collection.connect(addr1).mint({ value: mintPrice });

            // Move time to after end time
            await time.increaseTo(endTime + 1);

            // Should not be able to mint after end time
            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.be.revertedWith("Minting ended");
        });

        it("Should allow minting with no time restrictions", async function () {
            const collection = await NFTCollection.deploy(
                name, symbol, description, maxSupply, mintPrice,
                owner.address, imageUrl, whitelistOnly, [], maxMintsPerWallet,
                0, 0  // No time restrictions
            );

            await expect(
                collection.connect(addr1).mint({ value: mintPrice })
            ).to.not.be.reverted;
        });

        it("Should fail deployment with invalid time window", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime + 3600;
            const endTime = startTime - 1;  // End time before start time

            await expect(
                NFTCollection.deploy(
                    name, symbol, description, maxSupply, mintPrice,
                    owner.address, imageUrl, whitelistOnly, [], maxMintsPerWallet,
                    startTime, endTime
                )
            ).to.be.revertedWith("End time must be after start time");
        });

        it("Should fail deployment with past start time", async function () {
            const currentTime = await time.latest();
            const startTime = currentTime - 3600;  // 1 hour ago
            const endTime = currentTime + 3600;    // 1 hour from now

            await expect(
                NFTCollection.deploy(
                    name, symbol, description, maxSupply, mintPrice,
                    owner.address, imageUrl, whitelistOnly, [], maxMintsPerWallet,
                    startTime, endTime
                )
            ).to.be.revertedWith("Start time must be in the future");
        });
    });

    describe("Image Update", function () {
        it("Should allow owner to update image", async function () {
            const newImageUrl = "https://yellow-advanced-tapir-566.mypinata.cloud/ipfs/bafkreihm66otwb66msutwb5opa2vgdsbnicb6cndwzh7mhprmrziu5qevm";
            const oldImageUrl = await nftCollection.image();
            
            await expect(nftCollection.setImage(newImageUrl))
                .to.emit(nftCollection, "ImageUpdated")
                .withArgs(oldImageUrl, newImageUrl);
                
            expect(await nftCollection.image()).to.equal(newImageUrl);
        });

        it("Should not allow non-owner to update image", async function () {
            const newImageUrl = "https://example.com/new-image.png";
            
            await expect(
                nftCollection.connect(addr1).setImage(newImageUrl)
            ).to.be.revertedWithCustomError(nftCollection, "OwnableUnauthorizedAccount");
        });

        it("Should reject empty image URL", async function () {
            await expect(
                nftCollection.setImage("")
            ).to.be.revertedWith("Image URL cannot be empty");
        });

        it("Should update tokenURI after image change", async function () {
            // First mint an NFT
            await nftCollection.connect(addr1).mint({ value: mintPrice });
            const originalTokenURI = await nftCollection.tokenURI(0);
            
            // Update image
            const newImageUrl = "https://yellow-advanced-tapir-566.mypinata.cloud/ipfs/bafkreihm66otwb66msutwb5opa2vgdsbnicb6cndwzh7mhprmrziu5qevm";
            await nftCollection.setImage(newImageUrl);
            
            // Check that tokenURI reflects new image
            const updatedTokenURI = await nftCollection.tokenURI(0);
            expect(updatedTokenURI).to.not.equal(originalTokenURI);
            
            // Decode and verify new image in metadata
            const base64Data = updatedTokenURI.split(",")[1];
            const jsonData = JSON.parse(
                Buffer.from(base64Data, "base64").toString()
            );
            expect(jsonData.image).to.equal(newImageUrl);
        });
    });
});