# trait-offer-merkle-tree
How does seaport and blur support NFT trait offers?

Searching through crypto twitter or Google only yields results about how to use merkle trees for NFT mint whitelists or resources that simply explain the data structure. This article will hopefully fill in the missing piece: how do marketplaces like blur and seaport use merkle trees for trait offers? In fact, this article will answer a more generalised question: how to use a merkle tree data structure to express an arbitrary set of token ids as part of the tree.

Seaport contracts define `OfferItem` and `ConsidertaionItem` structs:

![image](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*PJvcQBDBHy9wwj7z8iJ1TA.png)

Both have an `IdentifierOrCriteria` attribute. It can take a number of values. Assume we are talking about an NFT trade here. If it is set to zero, then no restriction is placed on what NFT out of the whole collection can be used for the trade. A merkle root can be used for this field to denote what NFTs you are willing to buy. Let’s see how to produce this value.

In `test/utils/criteria.js` [there is code](https://github.com/ProjectOpenSea/seaport/blob/1.1/test/utils/criteria.js) that creates a merkle tree. Here is the full code (without helper functions which you can find by following the link in the previous sentence):

```javascript
const merkleTree = (tokenIds) => {
  const elements = tokenIds
    .map((tokenId) =>
      Buffer.from(tokenId.toHexString().slice(2).padStart(64, "0"), "hex")
    )
    .sort(Buffer.compare)
    .filter((el, idx, arr) => {
      return idx === 0 || !arr[idx - 1].equals(el);
    });

  const bufferElementPositionIndex = elements.reduce((memo, el, index) => {
    memo[bufferToHex(el)] = index;
    return memo;
  }, {});

  // Create layers
  const layers = getLayers(elements);

  const root = bufferToHex(layers[layers.length - 1][0]);

  const proofs = Object.fromEntries(
    elements.map((el) => [
      ethers.BigNumber.from("0x" + el.toString("hex")).toString(),
      getHexProof(el, bufferElementPositionIndex, layers),
    ])
  );

  const maxProofLength = Math.max(
    ...Object.values(proofs).map((i) => i.length)
  );

  return {
    root,
    proofs,
    maxProofLength,
  };
};
```

It takes `tokenIds` as an input. These are `ethers`'s `BigNumber` with `toHexString` method defined on them. Note that `ethers` should be `^5.5.3` since newer version removes the `BigNumber` dependency.

```javascript
const elements = tokenIds
    .map((tokenId) =>
      Buffer.from(tokenId.toHexString().slice(2).padStart(64, "0"), "hex")
    )
    .sort(Buffer.compare)
    .filter((el, idx, arr) => {
      return idx === 0 || !arr[idx - 1].equals(el);
    });
```

We pad each hex form to be `64` hex chars long (`32` bytes) and sort in ascending order. Filter removes any duplicates. Here is what input — output would look like:

```javascript
// input
const tokenIds = [
  ethers.BigNumber.from(1),
  ethers.BigNumber.from(1),
  ethers.BigNumber.from(2),
  ethers.BigNumber.from(3),
  ethers.BigNumber.from(6)
];
```

```javascript
// output: elements
[
  <Buffer 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 01>,
  <Buffer 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 02>,
  <Buffer 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03>,
  <Buffer 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 06>
]
```

Notice the duplicate token id has been removed and the output only presents the unique ids. All of these are now the only leaves of the tree. With this information, you can now produce the proofs that a given leaf is in the tree. With a root and with proofs we can now say whether a particular leaf is in the tree. In this GitHub repo you will find `index.js` to play around with the above.

In the case of Blur, you are signing a message of a merkle root. This goes into their database, and when there is a buyer (in the case that you are selling), this value is pulled from the db, to verify that what the buyer is attempting to buy is in the tree.

Why use merkle trees for trait offers? Efficiency. You can fit all the information about however many tokens you are willing to trade in a single solidity word.

TLDR; You supply an array of BigNumber type tokenIds to merkleTree , it constructs the tree where leaves are the hex form tokenIds . The tree is not created for the entirety of the whole collection, it is created for the subset of tokenIds that a buyer or seller is interested in. For example, if I am interested in “gold fur” kongs, and they happen to be token ids: 2, 3, 5, 21, 69, 420, then those are the only leaves in our merkle tree. When there is a counterparty to the trade, you only need to pull the proof and check that it is part of the tree given by the root .
