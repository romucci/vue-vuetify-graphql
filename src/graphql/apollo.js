import Vue from 'vue'
import { ApolloClient } from 'apollo-client'
import { HttpLink } from 'apollo-link-http'
import { InMemoryCache } from 'apollo-cache-inmemory'
import { ApolloLink, split } from 'apollo-link'
import { onError } from 'apollo-link-error'
import { WebSocketLink } from 'apollo-link-ws'
import { setContext } from 'apollo-link-context'
import { getMainDefinition } from 'apollo-utilities'
import VueApollo from 'vue-apollo'

const httpLink = new HttpLink({
  uri: process.env.VUE_APP_GRAPHQL_ENDPOINT
})

// Set context with tokens
const middlewareLink = setContext(() => ({
  headers: {
    'x-token': localStorage.getItem('x-token'),
    'x-refresh-token': localStorage.getItem('x-refresh-token')
  }
}))

// Set tokens after the response
const afterwareLink = new ApolloLink((operation, forward) => {
  if (operation.variables) {
    operation.variables = JSON.parse(
      JSON.stringify(operation.variables),
      (key, value) => (key === '__typename' ? undefined : value)
    )
  }
  return forward(operation).map(response => {
    const { response: { headers } } = operation.getContext()
    if (headers) {
      const token = headers.get('x-token')
      const refreshToken = headers.get('x-refresh-token')

      if (token) {
        localStorage.setItem('x-token', token)
      }

      if (refreshToken) {
        localStorage.setItem('x-refresh-token', refreshToken)
      }
    }
    return response
  })
})

const httpLinkWithMiddleware = afterwareLink.concat(middlewareLink.concat(httpLink))

// Create the subscription websocket link
const wsLink = new WebSocketLink({
  uri: `${process.env.VUE_APP_GRAPHQL_SUBSCRIPTIONS_ENDPOINT}`,
  options: {
    reconnect: true,
    connectionParams: {
      token: localStorage.getItem('x-token'),
      refreshToken: localStorage.getItem('x-refresh-token')
    }
  }
})

const errorLink = onError(({ operation, response, graphQLErrors, networkError }) => {
  if (graphQLErrors) {
    graphQLErrors.map(({ message, locations, path }) => message)
  }
  if (networkError) console.log(`[Network error]: ${networkError}`)
})

const link = split(
  ({ query }) => {
    const { kind, operation } = getMainDefinition(query)
    return kind === 'OperationDefinition' && operation === 'subscription'
  },
  wsLink,
  httpLinkWithMiddleware
)

const defaultOptions = {
  watchQuery: {
    fetchPolicy: 'network-only'
  },
  query: {
    fetchPolicy: 'network-only'
  }
}

// Create the apollo client
export const apolloClient = new ApolloClient({
  link: errorLink.concat(link),
  cache: new InMemoryCache(),
  connectToDevTools: true,
  defaultOptions
})

// Install the vue plugin like before
Vue.use(VueApollo)

export const apolloProvider = new VueApollo({
  defaultClient: apolloClient
})
