import WebSocket from 'ws';
import { allCollections } from './allCollections.js';
import fetch from 'node-fetch';

// You can get your API key from https://reservoir.tools
// make this .env variable
const YOUR_API_KEY = 'bcc427ec-943a-5129-9fb1-13a8dfdb71c9';

// goerli: wss://ws.dev.reservoir.tools
// const wss = new WebSocket(`wss://ws.reservoir.tools?api_key=${YOUR_API_KEY}`);
// const os_options = {method: 'GET', headers: {accept: 'application/json', 'X-API-KEY': process.env.OS_API_KEY}};

const wss = new WebSocket(`wss://ws-sepolia.reservoir.tools?api_key=${YOUR_API_KEY}`);
const os_options = {method: 'GET', headers: {accept: 'application/json'}}; // no api key for testnet os

// Set the GraphQL endpoint URL
const graphqlEndpoint = "http://localhost:3000/graphql"
// const graphqlEndpoint = "https://fountaindigital.xyz/graphql"

// const osBaseURL = 'https://api.opensea.io/api/v1/'
const osBaseURL = 'https://testnets-api.opensea.io/api/v1/'

const getAllContactsQuery = `
    query GetAllContacts {
        getAllContacts {
            name
            _id
            addresses
        }
    }
`

const deleteNFTByTokenAndContractMutation = `
    mutation DeleteNFTByTokenAndContract($input: DeleteNftsByTokenAndContractInput!) {
        deleteNFTByTokenAndContract(input: $input) {
            name
            collectionName
            contact {
                name
            }
        }
    }
`

const getNftsByContactQuery = `
    query GetNFTsByContact($input: NftsByContactInput) {
        getNFTsByContact(input: $input) {
        name
        collectionName
        quantity
        ercType
        }
    }
`

const updateNFTMutation = `
    mutation UpdateNFT($input: UpdateNFTInput) {
        updateNFT(input: $input) {
        name
        collectionName
        quantity
        }
    }
`

const addNFTMutation = `
    mutation AddNFT($input: NFTInput!) {
        addNFT(input: $input) {
        name
        collectionName
        tokenId
        quantity
        contact {
            name
            _id
        }
        }
    }
`

let allContacts = []

// make this .env variable
const _jwt = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImM2MjYzZDA5NzQ1YjUwMzJlNTdmYTZlMWQwNDFiNzdhNTQwNjZkYmQiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJhenAiOiI3NzgxOTM1OTAyNzAtZzJvb2R1c3Q5aGkxOWFoMjA1N2ltM2tnYjFxZ2QzNTcuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJhdWQiOiI3NzgxOTM1OTAyNzAtZzJvb2R1c3Q5aGkxOWFoMjA1N2ltM2tnYjFxZ2QzNTcuYXBwcy5nb29nbGV1c2VyY29udGVudC5jb20iLCJzdWIiOiIxMDQ4ODc4OTAyNzgxOTUyNDcwNTciLCJoZCI6ImZvdW50YWluZGlnaXRhbC54eXoiLCJlbWFpbCI6ImJlbm5ldHRAZm91bnRhaW5kaWdpdGFsLnh5eiIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJuYmYiOjE2OTc0Nzk0OTMsIm5hbWUiOiJCZW5uZXR0IExhcnNvbiIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BQ2c4b2NMWDY4QVMzNlNCVzdUYWdVVF9BRnlYSXZTOWY4NGNvTk9sdExEdTZ2ZkU9czk2LWMiLCJnaXZlbl9uYW1lIjoiQmVubmV0dCIsImZhbWlseV9uYW1lIjoiTGFyc29uIiwibG9jYWxlIjoiZW4iLCJpYXQiOjE2OTc0Nzk3OTMsImV4cCI6MTY5NzQ4MzM5MywianRpIjoiYTQwN2FhODQ1NGYzOWZkZDEzNDlkZjgzY2NkZTNkZDM4MmE1YTliMCJ9.xXYG-BR3x2jZ7dSRFi76f5J1wBUcj8X6b1zqPh5ly9AzuU2uCARrHTgSOGSuh4nfzPRjt784nqu92pT0nDvTShL743Ph4GAcbN_OgqFudC57AKkTiejKXDLpOei8paGkFAe1led9goS_uyOSyu0unqCSkJNZwQoLJRTBoHJiRnYRRSNjktGxWxP8ytWUCKFdAW26H_nFLmC6IIM2OwXhBTqVdbsvQCDO6yCSogN_xhrP_XdTw-5SA0x31qNs3PUGsgC2gaj75_M4qTkJ-tINR7DMJ6ttZmp0Sztq36leR1z4KtkOyfAOPrCvhxfx2KIZ6ELqe9M5fzNKlp0vgEkI4A'

try {
    const result = await fetch(graphqlEndpoint, {
        method: 'POST', 
        headers: {
            'Content-type': 'application/json',
            'jwt': _jwt
        },
        body: JSON.stringify({query: getAllContactsQuery})
    })
    const res = await result.json()
    console.log("RES: " + JSON.stringify(res.data.getAllContacts.length))
    allContacts = res.data.getAllContacts
} catch(error) {
    console.error(error)
}

// let allContacts = await resolvers.Query.getAllContacts()
let allAddresses = [];
let recentTransfers = {}

for (var x = 0; x < allContacts.length; x++) {
    let currentContact = allContacts[x]
    for (var y = 0; y < currentContact.addresses.length; y++) {
        allAddresses.push(currentContact.addresses[y])
    }
}

console.log(`ALL ADDRESSES: ${allAddresses.length}`)
let count = -1
wss.on('open', function open() {
    console.log('Connected to Reservoir');

    wss.on('message', async function incoming(_data) {
        count++
        // console.log('Message received: ', JSON.stringify(JSON.parse(_data)));
        // console.log("COUNT: " + count)
        let transferData = JSON.parse(_data).data
        // console.log("TRANSFER DATA: " + JSON.stringify(transferData))
        let transferResult; // ASSET_MOVED_OUT ASSET_MOVED_IN ASSET_MOVED_BETWEEN_ADDRESSES ASSET_MOVED_BETWEEN_CONTACTS
        let fromContact;
        let toContact;
        if (transferData.from && transferData.to && transferData.token) {
            let from = transferData.from
            let to = transferData.to
            let token = transferData.token
            // console.log(`token ${token.tokenId} ${token.contract} moved from: ${from} to ${to}`)
            for (var i = 0; i <allContacts.length; i++) {
                let contact = allContacts[i]
                for (var j = 0; j <contact.addresses.length; j++) {
                    let address = contact.addresses[j]
                    if (address === from) {
                        fromContact = {
                            contact: contact,
                            address: address
                        }
                    } else if (address === to) {
                        toContact = {
                            contact: contact,
                            address: address
                        }
                    }
                }
            }
            // console.log(`FROM: ${fromContact ? "nice" : 'no from'} TO: ${toContact ? "nice" : "no to"}`)
            if (fromContact) { // the from address belongs to a contact in the black book
                let _fromContactRemaining = -1;
                let _toContactRemaining = -1;
                let fromContactNft = await sendGraphQL(getNftsByContactQuery, {
                    input: {contactId: fromContact.contact._id, 
                        contractAddress: token.contract, 
                        tokenId: Number(token.tokenId)
                    }
                })

                fromContactNft = fromContactNft.data.getNFTsByContact[0]
                // console.log("FROM CONTACT NFT: " + JSON.stringify(fromContactNft))
                if(!toContact) { // the to address does NOT belong to a contact in the black book
                    if (fromContactNft.ercType === 'ERC1155') {
                        console.log("is erc1155")

                        // const result = await fetch(`${osBaseURL}asset/${token.contract}/${token.tokenId}/?account_address=${fromContact.address}`, os_options)
                        // const fromContactNFTQuantity = await result.json()
                        // let _quantity = Number(fromContactNFTQuantity.ownership.quantity)
                        console.log("QUANTITY: IS IT UPDATED YET? : " + fromContactNft.quantity)
                        let _amount = Number(transferData.amount)
                        _fromContactRemaining = fromContactNft.quantity - _amount
                    }
                    if (_fromContactRemaining === 0 || fromContactNft.ercType === 'ERC721') {
                        try {
                            console.log("ASSET_MOVED_OUT") // TODO: DONE
                            const variables = {
                                input: {
                                    tokenId: Number(token.tokenId),
                                    contractAddress: token.contract,
                                    contact: fromContact.contact._id
                                }
                            }
                        const response = await sendGraphQL(deleteNFTByTokenAndContractMutation, variables)
                        console.log("ASSET MOVED OUT RESPONSE: " + JSON.stringify(response))
                        } catch(error) {
                            console.error(error)
                        }
                    } else if (_fromContactRemaining > 0) {
                        try {
                            console.log("ASSET_AMOUNT_REDUCED") // TODO: DONE
                            const variables = {
                                input: {
                                    contact: fromContact.contact._id,
                                    tokenId: Number(token.tokenId),
                                    contractAddress: token.contract,
                                    quantity: _fromContactRemaining
                                }
                            }
                            const response = await sendGraphQL(updateNFTMutation, variables)
                            console.log("ASSET AMOUNT REDUCED RESPONSE: " + JSON.stringify(response))
                        } catch(error) {
                            console.error(error)
                        }
                    }
                } else { // the to address DOES belong to a contact in the black book
                    if (recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract]) {
                        console.log("RECENT TRANSFER!")
                        recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 0
                        return;
                    }
                    if(fromContact.contact._id === toContact.contact._id) { // SAME CONTACT - meaning they moved it between their own addresses
                        console.log("ASSET_MOVED_BETWEEN_ADDRESSES") // TODO: what do you do if one contact has the same erc1155 in two different addresses? (change ownerAddress on nft to an array??)
                        recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 1

                        try {
                            const variables = {
                                input: {
                                    contact: fromContact.contact._id,
                                    tokenId: Number(token.tokenId),
                                    contractAddress: token.contract,
                                    ownerAddress: toContact.address
                                }
                            }
                            const response = await sendGraphQL(updateNFTMutation, variables)
                            console.log("ASSET MOVED BETWEEN ADDRESSES RESPONSE: " + JSON.stringify(response))
                        } catch(error) {
                            console.error(error)
                        }

                    } else { // NOT same contact - meaning it was moved between contacts in the black book
                        console.log("ASSET_MOVED_BETWEEN_CONTACTS") // TODO: DONE
                        recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 1

                        // const fromContactResult = await fetch(`${osBaseURL}asset/${token.contract}/${token.tokenId}/?account_address=${fromContact.address}`, os_options)
                        // const fromContactNFTQuantity = await fromContactResult.json()
                        // let fc_quantity = Number(fromContactNFTQuantity.ownership.quantity)
                        // console.log("FROM CONTACT QUANTITY: " + fc_quantity)
                        let fc_amount = Number(transferData.amount)
                        _fromContactRemaining = fromContactNft.quantity - fc_amount
                        console.log(`asset id: ${token.tokenId} contract address: ${token.contract}`)
                        console.log(`from contact: ${fromContact.address} before had: ${fromContactNft.quantity} after ${fc_amount} were transferred away, it now has: ${_fromContactRemaining}`)

                        if (_fromContactRemaining > 0) {
                            try {
                                console.log("ASSET_AMOUNT_REDUCED FROM CONTACT") // TODO: DONE
                                const variables = {
                                    input: {
                                        contact: fromContact.contact._id,
                                        tokenId: Number(token.tokenId),
                                        contractAddress: token.contract,
                                        quantity: _fromContactRemaining
                                    }
                                }
                                const response = await sendGraphQL(updateNFTMutation, variables)
                                console.log("ASSET AMOUNT REDUCED FROM CONTACT RESPONSE: " + JSON.stringify(response))
                            } catch(error) {
                                console.error(error)
                            }

                        } else {
                            try {
                                console.log("ASSET_MOVED_OUT FROM CONTACT") // TODO: DONE
                                const variables = {
                                    input: {
                                        tokenId: Number(token.tokenId),
                                        contractAddress: token.contract,
                                        contact: fromContact.contact._id
                                    }
                                }
                            const response = await sendGraphQL(deleteNFTByTokenAndContractMutation, variables)
                            console.log("ASSET MOVED OUT FROM CONTACT RESPONSE: " + JSON.stringify(response))
                            } catch(error) {
                                console.error(error)
                            }
                        }

                        // const toContactResult = await fetch(`${osBaseURL}asset/${token.contract}/${token.tokenId}/?account_address=${toContact.address}`, os_options)
                        // const toContactNFTResponse = await toContactResult.json()

                        // console.log("OWNERSHIP: " + toContactNFTResponse.ownership + "status: " + toContactResult.status)

                        let toContactNft = await sendGraphQL(getNftsByContactQuery, {
                            input: {contactId: toContact.contact._id, 
                                contractAddress: token.contract, 
                                tokenId: Number(token.tokenId)
                            }
                        })

                        console.log("TO CONTACT NFT: " + JSON.stringify(toContactNft.data))

                        if(toContactNft.data.getNFTsByContact.length === 0) {
                            const toContactResult = await fetch(`${osBaseURL}asset/${token.contract}/${token.tokenId}/?account_address=${toContact.address}`, os_options)
                            const toContactNFTResponse = await toContactResult.json()
                            console.log("NEW NFT")
                            // : " + JSON.stringify(toContactNFTResponse))
                            try {
                                const newAssetTraits = toContactNFTResponse.traits.map((trait) => {
                                    return {
                                      "type": trait.trait_type.toLowerCase(),
                                      "value": trait.value.toString().toLowerCase()
                                    }
                                  })
                                const variables = {
                                    input: {
                                        name: toContactNFTResponse.name,
                                        image: toContactNFTResponse.image_thumbnail_url,
                                        tokenId: Number(token.tokenId),
                                        ercType: toContactNFTResponse.asset_contract.schema_name,
                                        ownerAddress: toContact.address,
                                        contractAddress: token.contract,
                                        slug: toContactNFTResponse.collection.slug,
                                        collectionName: toContactNFTResponse.collection.name,
                                        contact: toContact.contact._id,
                                        quantity: Number(transferData.amount),
                                        traits: newAssetTraits
                                    }
                                }
                                const response = await sendGraphQL(addNFTMutation, variables)
                                console.log("ASSET AMOUNT INCREASED TO CONTACT RESPONSE: " + JSON.stringify(response))
                            } catch(error) {
                                console.error(error)
                            }
                        } else {
                            console.log("UPDATE NFT")
                            let tc_quantity = toContactNft.data.getNFTsByContact[0].quantity
                            let tc_amount = Number(transferData.amount)
                            _toContactRemaining = tc_quantity + tc_amount

                            console.log(`asset id: ${token.tokenId} contract address: ${token.contract}`)
                            console.log(`to contact: ${toContact.address} before had: ${tc_quantity} after ${tc_amount} were transferred to it, it now has: ${_toContactRemaining}`)

                            try {
                                const variables = {
                                    input: {
                                        contact: toContact.contact._id,
                                        tokenId: Number(token.tokenId),
                                        contractAddress: token.contract,
                                        quantity: _toContactRemaining
                                    }
                                }
                                const response = await sendGraphQL(updateNFTMutation, variables)
                                console.log("ASSET AMOUNT INCREASED TO CONTACT RESPONSE: " + JSON.stringify(response))
                            } catch(error) {
                                console.error(error)
                            }
                        }
        
                        // fromContactNft = fromContactNft.data.getNFTsByContact[0]

                        // if(!toContactNFTResponse.ownership) {
                        //     console.log("NEW NFT: " + JSON.stringify(toContactNFTResponse))
                        //     try {
                        //         const newAssetTraits = toContactNFTResponse.traits.map((trait) => {
                        //             return {
                        //               "type": trait.trait_type.toLowerCase(),
                        //               "value": trait.value.toString().toLowerCase()
                        //             }
                        //           })
                        //         const variables = {
                        //             input: {
                        //                 name: toContactNFTResponse.name,
                        //                 image: toContactNFTResponse.image_thumbnail_url,
                        //                 tokenId: Number(token.tokenId),
                        //                 ercType: toContactNFTResponse.asset_contract.schema_name,
                        //                 ownerAddress: toContact.address,
                        //                 contractAddress: token.contract,
                        //                 slug: toContactNFTResponse.collection.slug,
                        //                 collectionName: toContactNFTResponse.collectionName,
                        //                 contact: toContact.contact._id,
                        //                 quantity: Number(transferData.amount),
                        //                 traits: newAssetTraits
                        //             }
                        //         }
                        //         const response = await sendGraphQL(addNFTMutation, variables)
                        //         console.log("ASSET AMOUNT INCREASED TO CONTACT RESPONSE: " + JSON.stringify(response))
                        //     } catch(error) {
                        //         console.error(error)
                        //     }
                        // } else {
                        //     console.log("UPDATE NFT")
                        //     let tc_quantity = Number(toContactNFTResponse.ownership.quantity)
                        //     let tc_amount = Number(transferData.amount)
                        //     _toContactRemaining = tc_quantity + tc_amount

                        //     console.log(`asset id: ${token.tokenId} contract address: ${token.contract}`)
                        //     console.log(`to contact: ${toContact.address} before had: ${tc_quantity} after ${tc_amount} were transferred to it, it now has: ${_toContactRemaining}`)

                        //     try {
                        //         const variables = {
                        //             input: {
                        //                 contact: toContact.contact._id,
                        //                 tokenId: Number(token.tokenId),
                        //                 contractAddress: token.contract,
                        //                 quantity: _toContactRemaining
                        //             }
                        //         }
                        //         const response = await sendGraphQL(updateNFTMutation, variables)
                        //         console.log("ASSET AMOUNT INCREASED TO CONTACT RESPONSE: " + JSON.stringify(response))
                        //     } catch(error) {
                        //         console.error(error)
                        //     }
                        // }
                    }
                }
            } else if (toContact) { // from address does NOT match any contacts but the to address DOES match a contacts address
                console.log("ASSET_MOVED_IN") // TODO
            }
            // console.log(`from contact: ${JSON.stringify(fromContact)} to contact ${JSON.stringify(toContact)}`)
        }




        // When the connection is ready, subscribe to the top-bids event
        if (JSON.parse(_data).status === 'ready') {
            console.log('Subscribing');
            wss.send(
                JSON.stringify({
                    type: 'subscribe',
                    event: 'transfer.created',
                    filters: {
                        address: allCollections,
                        from: allAddresses
                    }
                }),
            );

            wss.send(
                JSON.stringify({
                    type: 'subscribe',
                    event: 'transfer.created',
                    filters: {
                        address: allCollections,
                        to: allAddresses
                    }
                }),
            );

            // To unsubscribe, send the following message
            // wss.send(
            //     JSON.stringify({
            //         type: 'unsubscribe',
            //         event: 'top-bid.changed',
            //     }),
            // );
        }
    });
});

const sendGraphQL = (async (_query, _variables) => {
    const result = await fetch(graphqlEndpoint, {
        method: 'POST', 
        headers: {
            'Content-type': 'application/json',
            'jwt': _jwt
        },
        body: JSON.stringify({
            query: _query,
            variables: _variables
        })
    })
    const res = await result.json()
    return res
});

// // const osBaseURL = 'https://testnets-api.opensea.io/api/v1/' TEST NET URL 
// let allContacts = await resolvers.Query.getAllContacts()
// let allAddresses = [];
// let recentTransfers = {}

// for (var x = 0; x < allContacts.length; x++) {
//   let currentContact = allContacts[x]
//   for (var y = 0; y < currentContact.addresses.length; y++) {
//       allAddresses.push(currentContact.addresses[y])
//   }
// }

// console.log(`ALL ADDRESSES: ${allAddresses.length}`)


// let count = -1;


// wss.on('open', function open() {
//   console.log('Connected to Reservoir');

//   wss.on('message', async function incoming(_data) {
//       // console.log('Message received: ', JSON.stringify(JSON.parse(_data)));
//       count++
//       let transferData = JSON.parse(_data).data
//       // console.log("TRANSFER DATA: " + JSON.stringify(transferData))
//       let transferResult; // ASSET_MOVED_OUT ASSET_MOVED_IN ASSET_MOVED_BETWEEN_ADDRESSES ASSET_MOVED_BETWEEN_CONTACTS
//       let fromContact;
//       let toContact;

//       if (count === 0) {
//         let params = {
//           contactId: allContacts[0]._id
//         }
//         let fromContactNFTs = await resolvers.Query.getNFTsByContact(params);
//         console.log("FROM CONTACT NFTS: " + JSON.stringify(fromContactNFTs))
//       }
//       // console.log("COUNT: " + count)

//       // if (count === 0) {
//       //   console.log('get all contacts')
//       //   allContacts = await resolvers.Query.getAllContacts()
//       //   allAddresses = [];
      
  
//       //   for (var x = 0; x < allContacts.length; x++) {
//       //     let currentContact = allContacts[x]
//       //     for (var y = 0; y < currentContact.addresses.length; y++) {
//       //         allAddresses.push(currentContact.addresses[y])
//       //     }
//       //   }  
//       // }

//       if (transferData.from && transferData.to && transferData.token) {
//         allContacts = await resolvers.Query.getAllContacts()
//         allAddresses = [];
      

//         for (var x = 0; x < allContacts.length; x++) {
//           let currentContact = allContacts[x]
//           for (var y = 0; y < currentContact.addresses.length; y++) {
//               allAddresses.push(currentContact.addresses[y])
//           }
//         }
        
//           let from = transferData.from
//           let to = transferData.to
//           let token = transferData.token

//           console.log(`token ${token.tokenId} ${token.contract} moved from: ${from} to ${to}`)
//           for (var i = 0; i <allContacts.length; i++) {
//               let contact = allContacts[i]
//               for (var j = 0; j <contact.addresses.length; j++) {
//                   let address = contact.addresses[j]
//                   if (address === from) {
//                       fromContact = {
//                           contact: contact,
//                           address: address
//                       }
//                   } else if (address === to) {
//                       toContact = {
//                           contact: contact,
//                           address: address
//                       }
//                   }
//               }
//           }
//           console.log(`MOVED ${transferData.amount} NFT(S) FROM: ${fromContact ? "nice" : 'no from'} TO: ${toContact ? "nice" : "no to"}`)
//           if (fromContact) { // the from address belongs to a contact in the black book
//             // let fromContactNFTs = resolvers.Query.getNFTsByContact();
//               if(!toContact) { // the to address does NOT belong to a contact in the black book
//                   console.log("ASSET_MOVED_OUT") // DONE
//                   // console.log(`BEFORE: tokenId: ${Number(token.tokenId)} ${typeof Number(token.tokenId)}\ncontractAddress: ${token.contract} ${typeof token.contract} `)
//                   resolvers.Mutation.deleteNFTByTokenAndContract(Number(token.tokenId), token.contract)
//                   return
//               } else { // the to address DOES belong to a contact in the black book
//                   if (recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract]) {
//                       console.log("RECENT TRANSFER!")
//                       recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 0
//                       return;
//                   }
//                   if(fromContact.contact._id === toContact.contact._id) { // SAME CONTACT - meaning they moved it between their own addresses
//                       console.log("ASSET_MOVED_BETWEEN_ADDRESSES") // DONE
//                       recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 1
//                       console.log(`Token: ${token.tokenId} contract: ${token.contract} new owner address: ${toContact.address}`)
//                       resolvers.Mutation.updateNFT(Number(token.tokenId), token.contract, toContact.address, null)
//                       return
//                   } else { // NOT same contact - meaning it was moved between contacts in the black book
//                       console.log("ASSET_MOVED_BETWEEN_CONTACTS") // DONE
//                       recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 1
//                       resolvers.Mutation.updateNFT(Number(token.tokenId), token.contract, toContact.address, toContact.contact.name)
//                       return
//                   }
//               }
//           } else if (toContact) { // from address does NOT match any contacts but the to address DOES match a contacts address
//               console.log("ASSET_MOVED_IN") // TODO
//               fetch(`${testnetBaseURL}asset/${token.contract}/${token.tokenId}/?account_address=${toContact.address}`, os_options)
//                 .then((results) => {
//                   results.json().then((asset) => {
//                     console.log("RES: " + JSON.stringify(asset))

//                     const newAssetTraits = asset.traits.map((trait) => {
//                       return {
//                         "type": trait.trait_type.toLowerCase(),
//                         "value": trait.value.toString().toLowerCase()
//                       }
//                     })
              
//                     let newNFT = {
//                       name: asset.name,
//                       tokenId: Number(token.tokenId),
//                       ownerAddress: toContact.address,
//                       quantity: Number(transferData.amount),
//                       ercType: asset.asset_contract.schema_name,
//                       image: asset.image_thumbnail_url,
//                       contractAddress: token.contract,
//                       slug: asset.collection.slug,
//                       collectionName: asset.collection.name,
//                       contact: toContact.contact,
//                       traits: newAssetTraits
//                     }

//                       resolvers.Mutation.addNFT(newNFT).then((nft) => {
//                         console.log("NFT ADDED: " + JSON.stringify(nft))
//                         return nft
//                       })
//                   })
//               })
//           }
//       }




//       // When the connection is ready, subscribe to the top-bids event
//       if (JSON.parse(_data).status === 'ready') {
//           console.log('Subscribing');
//           let collectionsInclAB = COLLECTIONS
//           // collectionsInclAB.push("0xa7d8d9ef8d8ce8992df33d8b8cf4aebabd5bd270")
//           wss.send(
//               (JSON.stringify({
//                   type: 'subscribe',
//                   event: 'transfer.created',
//                   filters: {
//                       address: collectionsInclAB,
//                       from: allAddresses
//                   }
//               })),
//               wss.send(
//                 (JSON.stringify({
//                     type: 'subscribe',
//                     event: 'transfer.created',
//                     filters: {
//                         address: collectionsInclAB,
//                         to: allAddresses
//                     }
//                 })),
//             )
//           );
//       }
//   });
// });