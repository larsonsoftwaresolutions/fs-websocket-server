import WebSocket from 'ws';
import { allContacts } from './allContacts.js';
import { allCollections } from './allCollections.js';

// You can get your API key from https://reservoir.tools
const YOUR_API_KEY = 'bcc427ec-943a-5129-9fb1-13a8dfdb71c9';

// goerli: wss://ws.dev.reservoir.tools
const wss = new WebSocket(`wss://ws.reservoir.tools?api_key=${YOUR_API_KEY}`);

let allAddresses = [];
let recentTransfers = {}

for (var x = 0; x < allContacts.length; x++) {
    let currentContact = allContacts[x]
    for (var y = 0; y < currentContact.addresses.length; y++) {
        allAddresses.push(currentContact.addresses[y])
    }
}

// console.log(`ALL ADDRESSES: ${JSON.stringify(allAddresses)} COUNT: ${allAddresses.length}`)

wss.on('open', function open() {
    console.log('Connected to Reservoir');

    wss.on('message', function incoming(_data) {
        console.log('Message received: ', JSON.stringify(JSON.parse(_data)));
        let transferData = JSON.parse(_data).data
        // console.log("TRANSFER DATA: " + JSON.stringify(transferData))
        let transferResult; // ASSET_MOVED_OUT ASSET_MOVED_IN ASSET_MOVED_BETWEEN_ADDRESSES ASSET_MOVED_BETWEEN_CONTACTS
        let fromContact;
        let toContact;
        if (transferData.from && transferData.to && transferData.token) {
            let from = transferData.from
            let to = transferData.to
            let token = transferData.token
            console.log(`token ${token.tokenId} ${token.contract} moved from: ${from} to ${to}`)
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
            console.log(`FROM: ${fromContact ? "nice" : 'no from'} TO: ${toContact ? "nice" : "no to"}`)
            if (fromContact) { // the from address belongs to a contact in the black book
                if(!toContact) { // the to address does NOT belong to a contact in the black book
                    console.log("ASSET_MOVED_OUT")
                } else { // the to address DOES belong to a contact in the black book
                    if (recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract]) {
                        console.log("RECENT TRANSFER!")
                        recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 0
                        return;
                    }
                    if(fromContact.contact._id === toContact.contact._id) { // SAME CONTACT - meaning they moved it between their own addresses
                        console.log("ASSET_MOVED_BETWEEN_ADDRESSES")
                        recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 1
                    } else { // NOT same contact - meaning it was moved between contacts in the black book
                        console.log("ASSET_MOVED_BETWEEN_CONTACTS")
                        recentTransfers[fromContact.address+toContact.address+token.tokenId+token.contract] = 1
                    }
                }
            } else if (toContact) { // from address does NOT match any contacts but the to address DOES match a contacts address
                console.log("ASSET_MOVED_IN")
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
