// require('isomorphic-fetch');
import _fetch from "isomorphic-fetch";

_fetch('http://localhost:3000/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `
    query {
        getAllContacts {
        _id
        name
        telegram
        twitter
        discord
        email
        phone
        addresses
        notes
        }
    }
    ` 
  }),
})
.then(res => res.json())
.then(res => console.log(res.data));





// const GET_ALL_CONTACTS = gql`
//   query {
//     getAllContacts {
//       _id
//       name
//       telegram
//       twitter
//       discord
//       email
//       phone
//       addresses
//       notes
//     }
//   }
// `;

// const DELETE_CONTACT = gql`
//   mutation($contactId: ID!) {
//     deleteContact(contactId: $contactId) {
//       _id
//       name
//       telegram
//       twitter
//       discord
//       email
//       phone
//       addresses
//       notes
//     }
//   }
// `;

// const ADD_CONTACT = gql`
//   mutation AddContact($input: ContactInput!) {
//     addContact(input: $input) {
//       _id
//       name
//       telegram
//       discord
//       twitter
//       email
//       phone
//       addresses
//       notes
//     }
//   }
// `;

// const UPDATE_CONTACT = gql`
//   mutation UpdateContact($contactId: ID!, $input: ContactInput!) {
//     updateContact(contactId: $contactId, input: $input) {
//       _id
//       name
//       telegram
//       discord
//       twitter
//       email
//       phone
//       addresses
//       notes
//       lastModified
//     }
//   }
// `;

// export {GET_ALL_CONTACTS, DELETE_CONTACT, ADD_CONTACT, UPDATE_CONTACT}

