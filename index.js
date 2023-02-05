const { ethers } = require("ethers");
const { bufferToHex, keccak256 } = require("ethereumjs-util");

const merkleTree = (tokenIds) => {
  const elements = tokenIds
    .map((tokenId) =>
      Buffer.from(tokenId.toHexString().slice(2).padStart(64, "0"), "hex")
    )
    .sort(Buffer.compare)
    .filter((el, idx, arr) => {
      return idx === 0 || !arr[idx - 1].equals(el);
    });
  console.log('elements', elements);

  const bufferElementPositionIndex = elements.reduce((memo, el, index) => {
    memo[bufferToHex(el)] = index;
    return memo;
  }, {});
  console.log('bufferElementPositionIndex', bufferElementPositionIndex);

  // Create layers
  const layers = getLayers(elements);
  console.log('layers', layers);

  const root = bufferToHex(layers[layers.length - 1][0]);
  console.log('root', root);

  const proofs = Object.fromEntries(
    elements.map((el) => [
      ethers.BigNumber.from("0x" + el.toString("hex")).toString(),
      getHexProof(el, bufferElementPositionIndex, layers),
    ])
  );
  console.log('proofs', proofs);

  const maxProofLength = Math.max(
    ...Object.values(proofs).map((i) => i.length)
  );
  console.log('maxProofLength', maxProofLength);

  return {
    root,
    proofs,
    maxProofLength,
  };
};

const getLayers = (elements) => {
  if (elements.length === 0) {
    throw new Error("empty tree");
  }

  const layers = [];
  layers.push(elements.map((el) => keccak256(el)));

  // Get next layer until we reach the root
  while (layers[layers.length - 1].length > 1) {
    layers.push(getNextLayer(layers[layers.length - 1]));
  }

  return layers;
};

const getNextLayer = (elements) => {
  return elements.reduce((layer, el, idx, arr) => {
    if (idx % 2 === 0) {
      // Hash the current element with its pair element
      layer.push(combinedHash(el, arr[idx + 1]));
    }

    return layer;
  }, []);
};

const combinedHash = (first, second) => {
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }

  return keccak256(Buffer.concat([first, second].sort(Buffer.compare)));
};

const getHexProof = (el, bufferElementPositionIndex, layers) => {
  let idx = bufferElementPositionIndex[bufferToHex(el)];

  if (typeof idx !== "number") {
    throw new Error("Element does not exist in Merkle tree");
  }

  const proofBuffer = layers.reduce((proof, layer) => {
    const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
    const pairElement = pairIdx < layer.length ? layer[pairIdx] : null;

    if (pairElement) {
      proof.push(pairElement);
    }

    idx = Math.floor(idx / 2);

    return proof;
  }, []);

  return proofBuffer.map((el) => "0x" + el.toString("hex"));
};


const tokenIds = [
    ethers.BigNumber.from(1),
    ethers.BigNumber.from(1), // will be removed by the filter
    ethers.BigNumber.from(2),
    ethers.BigNumber.from(3),
    ethers.BigNumber.from(6)
];
merkleTree(tokenIds);

