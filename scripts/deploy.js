const hre = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  const NFTFactory = await ethers.getContractFactory("NFTFactory");
  const nftFactory = await NFTFactory.deploy();
  await nftFactory.waitForDeployment();

  console.log("NFTFactory deployed to:", await nftFactory.getAddress());

  // 等待几个区块确认
  await nftFactory.deploymentTransaction().wait(5);

  // 验证合约
  console.log("Verifying contract...");
  await hre.run("verify:verify", {
    address: await nftFactory.getAddress(),
    constructorArguments: []
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 