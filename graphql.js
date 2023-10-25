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
    mutation DeleteNFTByTokenAndContract($input: DeleteNftByTokenAndContractInput!) {
        deleteNFTByTokenAndContract(input: $input) {
            name
            collectionName
            ownerAddress
        }
    }
`

const getNftsByContactQuery = `
    query GetNFTsByContact($input: NftsByContactInput) {
        getNFTsByContact(input: $input) {
        name
        collectionName
        ownerAddress
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
        quantity
        }
    }
`

export {getAllContactsQuery, deleteNFTByTokenAndContractMutation, getNftsByContactQuery, updateNFTMutation, addNFTMutation}