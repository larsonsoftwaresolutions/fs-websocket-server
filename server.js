import WebSocket from "ws";
import express from "express";
import { allCollections } from "./allCollections.js";
import {
  getAllContactsQuery,
  deleteNFTByTokenAndContractMutation,
  getNftsByContactQuery,
  updateNFTMutation,
  addNFTMutation,
  addTransferMutation,
} from "./graphql.js";
import "dotenv/config";
import { AUTOGLYPH_SERIES } from "./autoglyphSeries.js";
import bodyParser from "body-parser";
import TelegramBot from "node-telegram-bot-api";

let allAddresses = [];
let allContacts = [];
let recentTransfers = {};
let addressCount = 0;
let reservoirConnected = false;
let transfersCreated = 0;
let initialSubscribeToAll = true;

const JWT = process.env.JWT;
const jsonParser = bodyParser.json();

// USE FOR MAINNET
const graphqlEndpoint = "https://fountaindigital.xyz/graphql";
const alchemyBaseURL = `https://eth-mainnet.g.alchemy.com/nft/v3/${process.env.ALCHEMY_API_KEY}`;

// USE FOR TESTNET
// const graphqlEndpoint = "http://localhost:3000/graphql";
// const alchemyBaseURL = `https://eth-sepolia.g.alchemy.com/nft/v3/${process.env.ALCHEMY_API_KEY}`;

const alchemy_options = {
  method: "GET",
  headers: { accept: "application/json" },
};

const app = express();
const port = process.env.PORT || 3005;
// to get channel_id go to: https://api.telegram.org/botXXX:YYYY/getUpdates
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);

app.get("/test", (req, res) => {
  telegramBot.sendMessage(
    process.env.TELEGRAM_CHAT_ID,
    "telegram bot is running"
  );
  res.status(200).send("Nice: " + reservoirConnected + " " + transfersCreated);
});

async function sendGraphQL(_query, _variables) {
  let body;
  if (_variables) {
    body = {
      query: _query,
      variables: _variables,
    };
  } else {
    body = {
      query: _query,
    };
  }
  const result = await fetch(graphqlEndpoint, {
    method: "POST",
    headers: {
      "Content-type": "application/json",
      jwt: JWT,
    },
    body: JSON.stringify(body),
  });
  const res = await result.json();
  return res;
}

// USE FOR MAINNET
const wss = new WebSocket(
  `wss://ws.reservoir.tools?api_key=${process.env.WEBSOCKET_API_KEY}`
);

// USE FOR TESTNET
// console.log("WEBSOCKET API EKY: " + process.env.WEBSOCKET_API_KEY)
// const wss = new WebSocket(
//   `wss://ws-sepolia.reservoir.tools?api_key=${process.env.WEBSOCKET_API_KEY}`
// );

// Schedule updates every 5 minutes (adjust the interval as needed).
// setInterval(schedulePeriodicUpdates, 5 * 60 * 1000);
wss.on("open", function open() {
  console.log("Connected to Reservoir");
  reservoirConnected = true;

  wss.on("message", async function incoming(_data) {
    let transferData = JSON.parse(_data).data;
    console.log("HELLO: " + JSON.stringify(JSON.parse(_data)));
    if (transferData.event === "transfer.created") {
      transfersCreated++;
    }
    let fromContact;
    let toContact;

    if (
      transferData.from &&
      transferData.to &&
      transferData.token &&
      allCollections.includes(transferData.token.contract)
    ) {
      let from = transferData.from;
      let to = transferData.to;
      let token = transferData.token;
      for (var i = 0; i < allContacts.length; i++) {
        let contact = allContacts[i];
        for (var j = 0; j < contact.addresses.length; j++) {
          let address = contact.addresses[j];
          if (address === from) {
            fromContact = {
              contact: contact,
              address: address,
            };
          } else if (address === to) {
            toContact = {
              contact: contact,
              address: address,
            };
          }
        }
      }
      console.log("FROM CONTACT: " + JSON.stringify(fromContact));
      console.log("TO CONTACT: " + JSON.stringify(toContact));
      if (fromContact) {
        // the from address belongs to a contact in the black book
        let _fromContactRemaining = -1;
        let _toContactRemaining = -1;
        console.log(
          `\nparams: owner address: ${fromContact.address} contractAddress: ${
            token.contract
          } tokenId: ${Number(token.tokenId)}`
        );
        let fromContactNft = await sendGraphQL(getNftsByContactQuery, {
          input: {
            ownerAddress: fromContact.address,
            contractAddress: token.contract,
            tokenId: Number(token.tokenId),
          },
        });
        fromContactNft = fromContactNft.data.getNFTsByContact[0];
        if (!toContact) {
          // the to address does NOT belong to a contact in the black book
          if (fromContactNft.ercType === "ERC1155") {
            let _amount = Number(transferData.amount);
            _fromContactRemaining = fromContactNft.quantity - _amount;
          }
          if (
            _fromContactRemaining === 0 ||
            fromContactNft.ercType === "ERC721"
          ) {
            try {
              console.log("ASSET_MOVED_OUT");
              const variables = {
                input: {
                  tokenId: Number(token.tokenId),
                  contractAddress: token.contract,
                  ownerAddress: fromContact.address,
                },
              };
              const response = await sendGraphQL(
                deleteNFTByTokenAndContractMutation,
                variables
              );
              console.log(
                "ASSET MOVED OUT RESPONSE: " + JSON.stringify(response)
              );

              const transferVariables = {
                input: {
                  action: "ASSET_MOVED_OUT",
                  to: {
                    address: to,
                  },
                  from: {
                    address: fromContact.address,
                    contact: fromContact.contact._id,
                    contactName: fromContact.contact.name,
                  },
                  collectionName: fromContactNft.collectionName,
                  contractAddress: token.contract,
                  tokenId: Number(token.tokenId),
                },
              };

              console.log(
                "TRANSFER VARIABLES: " + JSON.stringify(transferVariables)
              );

              const transferResponse = await sendGraphQL(
                addTransferMutation,
                transferVariables
              );
              console.log(
                "ASSET_MOVED_OUT -- TRANSFER RESPONSE: " +
                  JSON.stringify(transferResponse)
              );

              let resp_data = transferResponse.data.addTransfer;

              let tgMessage = `
              Action: ${resp_data.action}

              From: ${resp_data.from.contactName} / ${resp_data.from.address}

              To: ${resp_data.to.address}

              Asset: https://opensea.io/assets/ethereum/${resp_data.contractAddress}/${resp_data.tokenId}
              `;

              telegramBot.sendMessage(process.env.TELEGRAM_CHAT_ID, tgMessage);
            } catch (error) {
              console.error(error);
            }
          } else if (_fromContactRemaining > 0) {
            try {
              console.log("ASSET_AMOUNT_REDUCED");
              const variables = {
                input: {
                  ownerAddress: fromContact.address,
                  tokenId: Number(token.tokenId),
                  contractAddress: token.contract,
                  quantity: _fromContactRemaining,
                },
              };
              const response = await sendGraphQL(updateNFTMutation, variables);
              console.log(
                "ASSET AMOUNT REDUCED RESPONSE: " + JSON.stringify(response)
              );
            } catch (error) {
              console.error(error);
            }
          }
        } else {
          // the to address DOES belong to a contact in the black book
          if (
            recentTransfers[
              fromContact.address +
                toContact.address +
                token.tokenId +
                token.contract
            ]
          ) {
            console.log("RECENT TRANSFER!");
            recentTransfers[
              fromContact.address +
                toContact.address +
                token.tokenId +
                token.contract
            ] = 0;
            return;
          }

          if (fromContact.contact._id === toContact.contact._id) {
            // SAME CONTACT - meaning they moved it between their own addresses
            console.log("ASSET_MOVED_BETWEEN_ADDRESSES");
            recentTransfers[
              fromContact.address +
                toContact.address +
                token.tokenId +
                token.contract
            ] = 1;

            let fc_amount = Number(transferData.amount);
            _fromContactRemaining = fromContactNft.quantity - fc_amount;
            console.log(
              `from contact: ${fromContact.address} before had: ${fromContactNft.quantity} after ${fc_amount} were transferred away, it now has: ${_fromContactRemaining}`
            );

            if (_fromContactRemaining > 0) {
              try {
                console.log("ASSET_AMOUNT_REDUCED FROM CONTACT");
                const variables = {
                  input: {
                    ownerAddress: fromContact.address,
                    tokenId: Number(token.tokenId),
                    contractAddress: token.contract,
                    quantity: _fromContactRemaining,
                  },
                };
                const response = await sendGraphQL(
                  updateNFTMutation,
                  variables
                );
                console.log(
                  "ASSET AMOUNT REDUCED FROM CONTACT RESPONSE: " +
                    JSON.stringify(response)
                );
              } catch (error) {
                console.error(error);
              }
            } else {
              try {
                console.log("ASSET_MOVED_OUT FROM CONTACT");
                const variables = {
                  input: {
                    tokenId: Number(token.tokenId),
                    contractAddress: token.contract,
                    ownerAddress: fromContact.address,
                  },
                };
                const response = await sendGraphQL(
                  deleteNFTByTokenAndContractMutation,
                  variables
                );
                console.log(
                  "ASSET MOVED OUT FROM CONTACT RESPONSE: " +
                    JSON.stringify(response)
                );
              } catch (error) {
                console.error(error);
              }
            }

            let toContactNft = await sendGraphQL(getNftsByContactQuery, {
              input: {
                ownerAddress: toContact.address,
                contractAddress: token.contract,
                tokenId: Number(token.tokenId),
              },
            });

            if (toContactNft.data.getNFTsByContact.length === 0) {
              const toContactResult = await fetch(
                `${alchemyBaseURL}/getNFTMetadata?contractAddress=${token.contract}&tokenId=${token.tokenId}&refreshCache=false`,
                alchemy_options
              );
              const nft = await toContactResult.json();
              console.log("NEW NFT: " + JSON.stringify(nft));
              try {
                let newAssetTraits = [];

                let traits = nft.raw.metadata.attributes
                  ? nft.raw.metadata.attributes
                  : nft.raw.metadata.traits
                  ? nft.raw.metadata.traits
                  : null;

                if (traits && nft.contract.name === "Art Blocks") {
                  newAssetTraits = traits.flatMap((trait) => {
                    const traitSplit = trait.value.toLowerCase().split(":", 2);
                    // alchemy returns traits like this "value	:	All Ringers"
                    // i dont want those. trait split will be length 1 in those cases. we skip those.
                    if (traitSplit.length === 1) {
                      return [];
                    }
                    return {
                      type: traitSplit[0],
                      value: traitSplit[1].trim(),
                    };
                  });
                } else if (traits) {
                  newAssetTraits = traits.flatMap((trait) => {
                    console.log(
                      "contract: " + nft.contract.name + " " + trait.trait_type
                    );

                    if (!trait.trait_type || !trait.value) {
                      return [];
                    }

                    if (nft.contract.name === "CRYPTOPUNKS") {
                      if (trait.trait_type === "type") {
                        console.log("TYPE!!: " + trait.value);
                        trait.value = trait.value.split(" ", 1)[0];
                        console.log("VALUE: " + trait.value);
                      }
                    }
                    return {
                      type: trait.trait_type.toLowerCase(),
                      value: trait.value.toString().toLowerCase(),
                    };
                  });
                } else if (nft.raw.metadata.tags) {
                  // superrare uses tags for some god forsaken reason
                  let tags = nft.raw.metadata.tags;
                  newAssetTraits = tags.map((tag) => {
                    return {
                      type: "tag",
                      value: tag,
                    };
                  });
                } else if (nft.contract.name === "Autoglyphs") {
                  newAssetTraits = [
                    {
                      type: "series",
                      value: AUTOGLYPH_SERIES[Number(nft.tokenId) - 1],
                    },
                  ];
                }

                const variables = {
                  input: {
                    name:
                      nft.name === "CryptoPunks"
                        ? nft.name.split("s", 1) + " #" + nft.tokenId
                        : nft.contract?.name === "Autoglyphs"
                        ? nft.contract.name.split("s", 1) + " #" + nft.tokenId
                        : nft.name,
                    image: nft.image.cachedUrl,
                    tokenId: Number(nft.tokenId),
                    ercType: nft.tokenType,
                    ownerAddress: toContact.address,
                    contractAddress: nft.contract.address.toLowerCase(),
                    slug: nft.collection.slug,
                    // slug: "test-collection",
                    collectionName: nft.collection.name,
                    // collectionName: "Test Collection",
                    contact: toContact.contact._id,
                    contactName: toContact.contact.name,
                    quantity: Number(transferData.amount),
                    traits: newAssetTraits,
                  },
                };
                const response = await sendGraphQL(addNFTMutation, variables);
                console.log(
                  "ASSET AMOUNT INCREASED TO CONTACT RESPONSE: " +
                    JSON.stringify(response)
                );
              } catch (error) {
                console.error(error);
              }
            } else {
              console.log("UPDATE NFT");
              let tc_quantity = toContactNft.data.getNFTsByContact[0].quantity;
              let tc_amount = Number(transferData.amount);
              _toContactRemaining = tc_quantity + tc_amount;

              console.log(
                `to contact: ${toContact.address} before had: ${tc_quantity} after ${tc_amount} were transferred to it, it now has: ${_toContactRemaining}`
              );

              try {
                const variables = {
                  input: {
                    ownerAddress: toContact.address,
                    tokenId: Number(token.tokenId),
                    contractAddress: token.contract,
                    quantity: _toContactRemaining,
                  },
                };
                const response = await sendGraphQL(
                  updateNFTMutation,
                  variables
                );
                console.log(
                  "ASSET AMOUNT INCREASED TO CONTACT RESPONSE: " +
                    JSON.stringify(response)
                );
              } catch (error) {
                console.error(error);
              }
            }
          } else {
            // NOT same contact - meaning it was moved between contacts in the black book
            console.log("ASSET_MOVED_BETWEEN_CONTACTS");
            recentTransfers[
              fromContact.address +
                toContact.address +
                token.tokenId +
                token.contract
            ] = 1;

            let fc_amount = Number(transferData.amount);
            _fromContactRemaining = fromContactNft.quantity - fc_amount;
            console.log(
              `from contact: ${fromContact.address} before had: ${fromContactNft.quantity} after ${fc_amount} were transferred away, it now has: ${_fromContactRemaining}`
            );

            if (_fromContactRemaining > 0) {
              try {
                console.log("ASSET_AMOUNT_REDUCED FROM CONTACT");
                const variables = {
                  input: {
                    ownerAddress: fromContact.address,
                    tokenId: Number(token.tokenId),
                    contractAddress: token.contract,
                    quantity: _fromContactRemaining,
                  },
                };
                const response = await sendGraphQL(
                  updateNFTMutation,
                  variables
                );
                console.log(
                  "ASSET AMOUNT REDUCED FROM CONTACT RESPONSE: " +
                    JSON.stringify(response)
                );
              } catch (error) {
                console.error(error);
              }
            } else {
              try {
                console.log("ASSET_MOVED_OUT FROM CONTACT");
                const variables = {
                  input: {
                    tokenId: Number(token.tokenId),
                    contractAddress: token.contract,
                    ownerAddress: fromContact.address,
                  },
                };
                const response = await sendGraphQL(
                  deleteNFTByTokenAndContractMutation,
                  variables
                );
                console.log(
                  "ASSET MOVED OUT FROM CONTACT RESPONSE: " +
                    JSON.stringify(response)
                );
              } catch (error) {
                console.error(error);
              }
            }

            let toContactNft = await sendGraphQL(getNftsByContactQuery, {
              input: {
                ownerAddress: toContact.address,
                contractAddress: token.contract,
                tokenId: Number(token.tokenId),
              },
            });

            console.log("TO CONTACT NFT: " + JSON.stringify(toContactNft.data));

            if (toContactNft.data.getNFTsByContact.length === 0) {
              const toContactResult = await fetch(
                `${alchemyBaseURL}/getNFTMetadata?contractAddress=${token.contract}&tokenId=${token.tokenId}&refreshCache=false`,
                alchemy_options
              );
              const nft = await toContactResult.json();
              console.log("NEW NFT: " + JSON.stringify(nft));
              try {
                let newAssetTraits = [];

                let traits = nft.raw.metadata.attributes
                  ? nft.raw.metadata.attributes
                  : nft.raw.metadata.traits
                  ? nft.raw.metadata.traits
                  : null;

                if (traits && nft.contract.name === "Art Blocks") {
                  newAssetTraits = traits.flatMap((trait) => {
                    const traitSplit = trait.value.toLowerCase().split(":", 2);
                    // alchemy returns traits like this "value	:	All Ringers"
                    // i dont want those. trait split will be length 1 in those cases. we skip those.
                    if (traitSplit.length === 1) {
                      return [];
                    }
                    return {
                      type: traitSplit[0],
                      value: traitSplit[1].trim(),
                    };
                  });
                } else if (traits) {
                  newAssetTraits = traits.flatMap((trait) => {
                    console.log(
                      "contract: " + nft.contract.name + " " + trait.trait_type
                    );

                    if (!trait.trait_type || !trait.value) {
                      return [];
                    }

                    if (nft.contract.name === "CRYPTOPUNKS") {
                      if (trait.trait_type === "type") {
                        console.log("TYPE!!: " + trait.value);
                        trait.value = trait.value.split(" ", 1)[0];
                        console.log("VALUE: " + trait.value);
                      }
                    }
                    return {
                      type: trait.trait_type.toLowerCase(),
                      value: trait.value.toString().toLowerCase(),
                    };
                  });
                } else if (nft.raw.metadata.tags) {
                  // superrare uses tags for some god forsaken reason
                  let tags = nft.raw.metadata.tags;
                  newAssetTraits = tags.map((tag) => {
                    return {
                      type: "tag",
                      value: tag,
                    };
                  });
                } else if (nft.contract.name === "Autoglyphs") {
                  newAssetTraits = [
                    {
                      type: "series",
                      value: AUTOGLYPH_SERIES[Number(nft.tokenId) - 1],
                    },
                  ];
                }

                const variables = {
                  input: {
                    name:
                      nft.name === "CryptoPunks"
                        ? nft.name.split("s", 1) + " #" + nft.tokenId
                        : nft.contract?.name === "Autoglyphs"
                        ? nft.contract.name.split("s", 1) + " #" + nft.tokenId
                        : nft.name,
                    image: nft.image.cachedUrl,
                    tokenId: Number(nft.tokenId),
                    ercType: nft.tokenType,
                    ownerAddress: toContact.address,
                    contractAddress: nft.contract.address.toLowerCase(),
                    slug: nft.collection.slug,
                    // slug: "test-collection",
                    collectionName: nft.collection.name,
                    // collectionName: "Test Collection",
                    contact: toContact.contact._id,
                    contactName: toContact.contact.name,
                    quantity: Number(transferData.amount),
                    traits: newAssetTraits,
                  },
                };
                const response = await sendGraphQL(addNFTMutation, variables);
                console.log(
                  "ASSET AMOUNT INCREASED TO CONTACT RESPONSE: " +
                    JSON.stringify(response)
                );
              } catch (error) {
                console.error(error);
              }
            } else {
              console.log("UPDATE NFT");
              let tc_quantity = toContactNft.data.getNFTsByContact[0].quantity;
              let tc_amount = Number(transferData.amount);
              _toContactRemaining = tc_quantity + tc_amount;

              console.log(
                `to contact: ${toContact.address} before had: ${tc_quantity} after ${tc_amount} were transferred to it, it now has: ${_toContactRemaining}`
              );

              try {
                const variables = {
                  input: {
                    ownerAddress: toContact.address,
                    tokenId: Number(token.tokenId),
                    contractAddress: token.contract,
                    quantity: _toContactRemaining,
                  },
                };
                const response = await sendGraphQL(
                  updateNFTMutation,
                  variables
                );
                console.log(
                  "ASSET AMOUNT INCREASED TO CONTACT RESPONSE: " +
                    JSON.stringify(response)
                );
              } catch (error) {
                console.error(error);
              }
            }
          }
        }
      } else if (toContact) {
        // from address does NOT match any contacts but the to address DOES match a contacts address
        console.log("ASSET_MOVED_IN");

        let toContactNft = await sendGraphQL(getNftsByContactQuery, {
          input: {
            ownerAddress: toContact.address,
            contractAddress: token.contract,
            tokenId: Number(token.tokenId),
          },
        });

        if (toContactNft.data.getNFTsByContact.length === 0) {
          const toContactResult = await fetch(
            `${alchemyBaseURL}/getNFTMetadata?contractAddress=${token.contract}&tokenId=${token.tokenId}&refreshCache=false`,
            alchemy_options
          );
          const nft = await toContactResult.json();
          console.log("NEW NFT: " + JSON.stringify(nft));
          try {
            let newAssetTraits = [];

            let traits = nft.raw.metadata.attributes
              ? nft.raw.metadata.attributes
              : nft.raw.metadata.traits
              ? nft.raw.metadata.traits
              : null;

            if (traits && nft.contract.name === "Art Blocks") {
              newAssetTraits = traits.flatMap((trait) => {
                const traitSplit = trait.value.toLowerCase().split(":", 2);
                // alchemy returns traits like this "value	:	All Ringers"
                // i dont want those. trait split will be length 1 in those cases. we skip those.
                if (traitSplit.length === 1) {
                  return [];
                }
                return {
                  type: traitSplit[0],
                  value: traitSplit[1].trim(),
                };
              });
            } else if (traits) {
              newAssetTraits = traits.flatMap((trait) => {
                console.log(
                  "contract: " + nft.contract.name + " " + trait.trait_type
                );

                if (!trait.trait_type || !trait.value) {
                  return [];
                }

                if (nft.contract.name === "CRYPTOPUNKS") {
                  if (trait.trait_type === "type") {
                    console.log("TYPE!!: " + trait.value);
                    trait.value = trait.value.split(" ", 1)[0];
                    console.log("VALUE: " + trait.value);
                  }
                }
                return {
                  type: trait.trait_type.toLowerCase(),
                  value: trait.value.toString().toLowerCase(),
                };
              });
            } else if (nft.raw.metadata.tags) {
              // superrare uses tags for some god forsaken reason
              let tags = nft.raw.metadata.tags;
              newAssetTraits = tags.map((tag) => {
                return {
                  type: "tag",
                  value: tag,
                };
              });
            } else if (nft.contract.name === "Autoglyphs") {
              newAssetTraits = [
                {
                  type: "series",
                  value: AUTOGLYPH_SERIES[Number(nft.tokenId) - 1],
                },
              ];
            }

            const variables = {
              input: {
                name:
                  nft.name === "CryptoPunks"
                    ? nft.name.split("s", 1) + " #" + nft.tokenId
                    : nft.contract?.name === "Autoglyphs"
                    ? nft.contract.name.split("s", 1) + " #" + nft.tokenId
                    : nft.name,
                image: nft.image.cachedUrl,
                tokenId: Number(nft.tokenId),
                ercType: nft.tokenType,
                ownerAddress: toContact.address,
                contractAddress: nft.contract.address.toLowerCase(),
                slug: nft.collection.slug,
                // slug: "test-collection",
                collectionName: nft.collection.name,
                // collectionName: "Test Collection",
                contact: toContact.contact._id,
                contactName: toContact.contact.name,
                quantity: Number(transferData.amount),
                traits: newAssetTraits,
              },
            };
            console.log("VARIABLES: " + JSON.stringify(variables));
            const response = await sendGraphQL(addNFTMutation, variables);
            console.log(
              "ASSET MOVED IN NEW RESPONSE: " + JSON.stringify(response)
            );

            const transferVariables = {
              input: {
                action: "ASSET_MOVED_IN",
                to: {
                  address: toContact.address,
                  contact: toContact.contact._id,
                  contactName: toContact.contact.name,
                },
                from: {
                  address: from,
                },
                collectionName: nft.collection.name,
                // collectionName: "Test Collection",
                contractAddress: token.contract,
                tokenId: Number(token.tokenId),
              },
            };

            console.log(
              "TRANSFER VARIABLES: " + JSON.stringify(transferVariables)
            );

            const transferResponse = await sendGraphQL(
              addTransferMutation,
              transferVariables
            );
            console.log(
              "ASSET_MOVED_IN -- TRANSFER RESPONSE: " +
                JSON.stringify(transferResponse)
            );

            let resp_data = transferResponse.data.addTransfer;

            let tgMessage = `
            Action: ${resp_data.action}

            To: ${resp_data.to.contactName} / ${resp_data.to.address}

            From: ${resp_data.from.address}

            Asset: https://opensea.io/assets/ethereum/${resp_data.contractAddress}/${resp_data.tokenId}
            `;

            telegramBot.sendMessage(process.env.TELEGRAM_CHAT_ID, tgMessage);
          } catch (error) {
            console.error(error);
          }
        } else {
          console.log("UPDATE NFT");
          let tc_quantity = toContactNft.data.getNFTsByContact[0].quantity;
          let tc_amount = Number(transferData.amount);
          let tc_remaining = tc_quantity + tc_amount;

          console.log(
            `to contact: ${toContact.address} before had: ${tc_quantity} after ${tc_amount} were transferred to it, it now has: ${tc_remaining}`
          );

          try {
            const variables = {
              input: {
                ownerAddress: toContact.address,
                tokenId: Number(token.tokenId),
                contractAddress: token.contract,
                quantity: tc_remaining,
              },
            };
            const response = await sendGraphQL(updateNFTMutation, variables);
            console.log(
              "ASSET MOVED IN UPDATE RESPONSE: " + JSON.stringify(response)
            );
          } catch (error) {
            console.error(error);
          }
        }
      }
    }
    if (JSON.parse(_data).status === "ready") {
      console.log("Subscribing");
      await fetchAndUpdateAddresses();
    }
  });
});

function subscribeToAll() {
  wss.send(
    JSON.stringify({
      type: "subscribe",
      event: "transfer.created",
      filters: {
        from: allAddresses,
      },
    })
  );

  wss.send(
    JSON.stringify({
      type: "subscribe",
      event: "transfer.created",
      filters: {
        to: allAddresses,
      },
    })
  );
  console.log("Subscribed!");
}

async function fetchAndUpdateAddresses() {
  allContacts = [];
  allAddresses = [];
  try {
    const res = await sendGraphQL(getAllContactsQuery);
    allContacts = res.data.getAllContacts;

    // console.log("All Contacts: " + JSON.stringify(allContacts));

    for (var x = 0; x < allContacts.length; x++) {
      let currentContact = allContacts[x];
      for (var y = 0; y < currentContact.addresses.length; y++) {
        allAddresses.push(currentContact.addresses[y]);
      }
    }
    console.log("All addresses: " + allAddresses.length);

    if (allAddresses.length !== addressCount) {
      addressCount = allAddresses.length;
      if (initialSubscribeToAll) {
        console.log("init subscribe to all: YES");
        initialSubscribeToAll = false;
      } else {
        console.log("init subscribe to all: NO");
        unsubscribeFromAll();
      }
      subscribeToAll();
    }
  } catch (error) {
    console.error(error);
  }
}

function unsubscribeFromAll() {
  // Unsubscribe from the "from" event
  wss.send(
    JSON.stringify({
      type: "unsubscribe",
      event: "transfer.created",
      filters: {
        from: allAddresses,
      },
    })
  );

  // Unsubscribe from the "to" event
  wss.send(
    JSON.stringify({
      type: "unsubscribe",
      event: "transfer.created",
      filters: {
        to: allAddresses,
      },
    })
  );
}

app.post("/updateContacts", jsonParser, (req, res) => {
  const payload = req.body;
  console.log("PAYLOAD: " + JSON.stringify(payload));

  fetchAndUpdateAddresses();
  res.status(200).send({ message: "Received!" });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
