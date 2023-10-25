import WebSocket from 'ws';
import { allCollections } from './allCollections.js';
import { getAllContactsQuery, deleteNFTByTokenAndContractMutation, getNftsByContactQuery, updateNFTMutation, addNFTMutation } from './graphql.js'
import 'dotenv/config';

let allAddresses = []
let allContacts = []
let updateContacts = false

const JWT = process.env.JWT
const OS_API_KEY = process.env.OS_API_KEY
const WEBSOCKET_API_KEY = process.env.WEBSOCKET_API_KEY

// USE FOR MAINNET
const wss = new WebSocket(`wss://ws.reservoir.tools?api_key=${WEBSOCKET_API_KEY}`);
const os_options = {method: 'GET', headers: {accept: 'application/json', 'X-API-KEY': OS_API_KEY}};

// USE FOR TESTNET
// const wss = new WebSocket(`wss://ws-sepolia.reservoir.tools?api_key=${process.env.WEBSOCKET_API_KEY}`);
// const os_options = {method: 'GET', headers: {accept: 'application/json'}}; // no api key for testnet os

// USE FOR MAINNET
const graphqlEndpoint = "https://www.fountaindigital.xyz/graphql"
const osBaseURL = 'https://api.opensea.io/api/v1/'
// testing for workflow trigger

// USE FOR TESTNET
// const graphqlEndpoint = "http://localhost:3000/graphql"
// const osBaseURL = 'https://testnets-api.opensea.io/api/v1/'


async function sendGraphQL(_query, _variables) {
    let body
    if(_variables) {
        body = {
            query: _query,
            variables: _variables
        }
    } else {
        body = {
            query: _query
        }
    }
    const result = await fetch(graphqlEndpoint, {
        method: 'POST', 
        headers: {
            'Content-type': 'application/json',
            'jwt': JWT
        },
        body: JSON.stringify(body)
    })
    const res = await result.json()
    return res
};

await fetchAndUpdateAddresses()
// Schedule updates every 5 minutes (adjust the interval as needed).
setInterval(schedulePeriodicUpdates, 5 * 60 * 1000);

wss.on('open', function open() {
    console.log('Connected to Reservoir');

    wss.on('message', async function incoming(_data) {
        let transferData = JSON.parse(_data).data
        let fromContact;
        let toContact;
        if (transferData.from && transferData.to && transferData.token) {
            let from = transferData.from
            let to = transferData.to
            let token = transferData.token
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
            if (fromContact) { // the from address belongs to a contact in the black book
                let _fromContactRemaining = -1;
                let _toContactRemaining = -1;
                console.log(`\nparams: owner address: ${fromContact.address} contractAddress: ${token.contract} tokenId: ${Number(token.tokenId)}`)
                let fromContactNft = await sendGraphQL(getNftsByContactQuery, {
                    input: {ownerAddress: fromContact.address,
                        contractAddress: token.contract, 
                        tokenId: Number(token.tokenId)
                    }
                })
                fromContactNft = fromContactNft.data.getNFTsByContact[0]
                if(!toContact) { // the to address does NOT belong to a contact in the black book
                    if (fromContactNft.ercType === 'ERC1155') {
                        let _amount = Number(transferData.amount)
                        _fromContactRemaining = fromContactNft.quantity - _amount
                    }
                    if (_fromContactRemaining === 0 || fromContactNft.ercType === 'ERC721') {
                        try {
                            console.log("ASSET_MOVED_OUT")
                            const variables = {
                                input: {
                                    tokenId: Number(token.tokenId),
                                    contractAddress: token.contract,
                                    ownerAddress: fromContact.address
                                }
                            }
                        const response = await sendGraphQL(deleteNFTByTokenAndContractMutation, variables)
                        console.log("ASSET MOVED OUT RESPONSE: " + JSON.stringify(response))
                        } catch(error) {
                            console.error(error)
                        }
                    } else if (_fromContactRemaining > 0) {
                        try {
                            console.log("ASSET_AMOUNT_REDUCED")
                            const variables = {
                                input: {
                                    ownerAddress: fromContact.address,
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
                        console.log("ASSET_MOVED_BETWEEN_ADDRESSES")
                        recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 1

                        let fc_amount = Number(transferData.amount)
                        _fromContactRemaining = fromContactNft.quantity - fc_amount
                        console.log(`from contact: ${fromContact.address} before had: ${fromContactNft.quantity} after ${fc_amount} were transferred away, it now has: ${_fromContactRemaining}`)

                        if (_fromContactRemaining > 0) {
                            try {
                                console.log("ASSET_AMOUNT_REDUCED FROM CONTACT")
                                const variables = {
                                    input: {
                                        ownerAddress: fromContact.address,
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
                                console.log("ASSET_MOVED_OUT FROM CONTACT")
                                const variables = {
                                    input: {
                                        tokenId: Number(token.tokenId),
                                        contractAddress: token.contract,
                                        ownerAddress: fromContact.address
                                    }
                                }
                            const response = await sendGraphQL(deleteNFTByTokenAndContractMutation, variables)
                            console.log("ASSET MOVED OUT FROM CONTACT RESPONSE: " + JSON.stringify(response))
                            } catch(error) {
                                console.error(error)
                            }
                        }

                        let toContactNft = await sendGraphQL(getNftsByContactQuery, {
                            input: {ownerAddress: toContact.address,
                                contractAddress: token.contract,
                                tokenId: Number(token.tokenId)
                            }
                        })

                        if(toContactNft.data.getNFTsByContact.length === 0) {
                            const toContactResult = await fetch(`${osBaseURL}asset/${token.contract}/${token.tokenId}/?account_address=${toContact.address}`, os_options)
                            const toContactNFTResponse = await toContactResult.json()
                            console.log("NEW NFT")
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

                            console.log(`to contact: ${toContact.address} before had: ${tc_quantity} after ${tc_amount} were transferred to it, it now has: ${_toContactRemaining}`)

                            try {
                                const variables = {
                                    input: {
                                        ownerAddress: toContact.address,
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
                    } else { // NOT same contact - meaning it was moved between contacts in the black book
                        console.log("ASSET_MOVED_BETWEEN_CONTACTS")
                        recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 1

                        let fc_amount = Number(transferData.amount)
                        _fromContactRemaining = fromContactNft.quantity - fc_amount
                        console.log(`from contact: ${fromContact.address} before had: ${fromContactNft.quantity} after ${fc_amount} were transferred away, it now has: ${_fromContactRemaining}`)

                        if (_fromContactRemaining > 0) {
                            try {
                                console.log("ASSET_AMOUNT_REDUCED FROM CONTACT")
                                const variables = {
                                    input: {

                                        ownerAddress: fromContact.address,
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
                                console.log("ASSET_MOVED_OUT FROM CONTACT")
                                const variables = {
                                    input: {
                                        tokenId: Number(token.tokenId),
                                        contractAddress: token.contract,
                                        ownerAddress: fromContact.address
                                    }
                                }
                            const response = await sendGraphQL(deleteNFTByTokenAndContractMutation, variables)
                            console.log("ASSET MOVED OUT FROM CONTACT RESPONSE: " + JSON.stringify(response))
                            } catch(error) {
                                console.error(error)
                            }
                        }

                        let toContactNft = await sendGraphQL(getNftsByContactQuery, {
                            input: {ownerAddress: toContact.address,
                                contractAddress: token.contract,
                                tokenId: Number(token.tokenId)
                            }
                        })

                        console.log("TO CONTACT NFT: " + JSON.stringify(toContactNft.data))

                        if(toContactNft.data.getNFTsByContact.length === 0) {
                            const toContactResult = await fetch(`${osBaseURL}asset/${token.contract}/${token.tokenId}/?account_address=${toContact.address}`, os_options)
                            const toContactNFTResponse = await toContactResult.json()
                            console.log("NEW NFT")
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

                            console.log(`to contact: ${toContact.address} before had: ${tc_quantity} after ${tc_amount} were transferred to it, it now has: ${_toContactRemaining}`)

                            try {
                                const variables = {
                                    input: {
                                        ownerAddress: toContact.address,
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
                    }
                }
            } else if (toContact) { // from address does NOT match any contacts but the to address DOES match a contacts address
                console.log("ASSET_MOVED_IN")

                let toContactNft = await sendGraphQL(getNftsByContactQuery, {
                    input: {ownerAddress: toContact.address,
                        contractAddress: token.contract,
                        tokenId: Number(token.tokenId)
                    }
                })

                if(toContactNft.data.getNFTsByContact.length === 0) {
                    const toContactResult = await fetch(`${osBaseURL}asset/${token.contract}/${token.tokenId}/?account_address=${toContact.address}`, os_options)
                    const toContactNFTResponse = await toContactResult.json()
                    try {
                        console.log("NEW NFT")
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
                        console.log("ASSET MOVED IN NEW RESPONSE: " + JSON.stringify(response))
                    } catch(error) {
                        console.error(error)
                    }
                } else {
                    console.log("UPDATE NFT")
                    let tc_quantity = toContactNft.data.getNFTsByContact[0].quantity
                    let tc_amount = Number(transferData.amount)
                    let tc_remaining = tc_quantity + tc_amount

                    console.log(`to contact: ${toContact.address} before had: ${tc_quantity} after ${tc_amount} were transferred to it, it now has: ${tc_remaining}`)

                    try {
                        const variables = {
                            input: {
                                ownerAddress: toContact.address,
                                tokenId: Number(token.tokenId),
                                contractAddress: token.contract,
                                quantity: tc_remaining
                            }
                        }
                        const response = await sendGraphQL(updateNFTMutation, variables)
                        console.log("ASSET MOVED IN UPDATE RESPONSE: " + JSON.stringify(response))
                    } catch(error) {
                        console.error(error)
                    }
                }
            }
        }
        // console.log("UPDATE CONTACTS: " + updateContacts)
        if (JSON.parse(_data).status === 'ready' || updateContacts) {
            console.log('Subscribing: ' + updateContacts);
            if (updateContacts) {
                updateContacts = false
            }
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
        }
    });
});

async function fetchAndUpdateAddresses() {
    allContacts = []
    allAddresses = []
    try {
        const res = await sendGraphQL(getAllContactsQuery)
        // const res = await result.json()
        console.log("All Contacts: " + JSON.stringify(res.data.getAllContacts.length))
        allContacts = res.data.getAllContacts

        for (var x = 0; x < allContacts.length; x++) {
            let currentContact = allContacts[x]
            for (var y = 0; y < currentContact.addresses.length; y++) {
                allAddresses.push(currentContact.addresses[y])
            }
        }
        console.log("All addresses: " + allAddresses.length)
        updateContacts = true
    } catch(error) {
        console.error(error)
    }
}

async function schedulePeriodicUpdates() {
    // Unsubscribe from the "from" event
    wss.send(
        JSON.stringify({
            type: 'unsubscribe',
            event: 'transfer.created',
            filters: {
                address: allCollections,
                from: allAddresses
            },
        }),
    );

    // Unsubscribe from the "to" event
    wss.send(
        JSON.stringify({
            type: 'unsubscribe',
            event: 'transfer.created',
            filters: {
                address: allCollections,
                to: allAddresses
            },
        }),
    );

    await fetchAndUpdateAddresses()
}