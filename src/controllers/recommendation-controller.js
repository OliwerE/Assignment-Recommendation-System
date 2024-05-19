/**
 * Module represents recommendation controller.
 *
 * @author Oliwer Ellréus <oe222ez@student.lnu.se>
 * @version 1.0.0
 */

import fs from 'fs'
import csv from 'csv-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import createError from 'http-errors'

import { User } from './User.js'
import { Rating } from './Rating.js'

// Get path to application
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Class represents Lits controller.
 */
export class RecommendationController {
  /**
   * Class constructor.
   */
  constructor () {
    this.moviesData = []
    this.ratingsData = []
    this.usersData = []
    this.users = []
  }

  /**
   * Configure data from CSV files.
   */
  configureCsvData () {
    this.readMoviesCSV()
  }

  /**
   * Add csv movie data to an array.
   */
  readMoviesCSV () {
    fs.createReadStream(path.resolve(__dirname, `../../data/${process.env.DATA_FOLDER}/movies.csv`))
      .pipe(csv({ separator: ';' }))
      .on('data', (data) => this.moviesData.push(data))
      .on('end', () => {
        this.readRatingsCSV()
      })
  }

  /**
   * Add csv rating data to an array.
   */
  readRatingsCSV () {
    fs.createReadStream(path.resolve(__dirname, `../../data/${process.env.DATA_FOLDER}/ratings.csv`))
      .pipe(csv({ separator: ';' }))
      .on('data', (data) => this.ratingsData.push(data))
      .on('end', () => {
        this.readUsersCSV()
      })
  }

  /**
   * Add csv user data to an array.
   */
  readUsersCSV () {
    fs.createReadStream(path.resolve(__dirname, `../../data/${process.env.DATA_FOLDER}/users.csv`))
      .pipe(csv({ separator: ';' }))
      .on('data', (data) => this.usersData.push(data))
      .on('end', () => {
        this.createUserRatingObjects()
      })
  }

  /**
   * Create users and ratings objects.
   */
  createUserRatingObjects () {
    // Create all users
    for (let i = 0; i < this.usersData.length; i++) {
      const ratingsByUser = this.getUserRatingsArray(this.usersData[i].UserId) // Returns array of rating objects (created by user)
      this.createUserObject(this.usersData[i].UserId, this.usersData[i].Name, ratingsByUser)
    }
  }

  /**
   * Creates an array of user rating objects based on a user id.
   *
   * @param {number} userId - Unique user id.
   * @returns {Array} - An array with the user rating objects.
   */
  getUserRatingsArray = (userId) => {
    const ratings = this.ratingsData.filter(obj => obj.UserId === userId) // All ratings created by user

    const result = []
    for (let i = 0; i < ratings.length; i++) {
      const movie = this.moviesData.filter(obj => obj.MovieId === ratings[i].MovieId) // One movie based on rating movie id
      const newRating = new Rating(ratings[i].MovieId, movie[0].Title, ratings[i].Rating)
      result.push(newRating)
    }
    return result
  }

  /**
   * Creates a user object.
   *
   * @param {number} userId - Unique user id.
   * @param {string} name - Name of the user.
   * @param {Array} ratingsByUser - Array of rating objects.
   */
  createUserObject (userId, name, ratingsByUser) {
    const newUser = new User(userId, name, ratingsByUser)
    this.users.push(newUser)
  }

  /**
   * Returns all users stored in usersData.
   *
   * @param {object} req - Request object.
   * @param {object} res - Response object.
   * @param {Function} next - Next function.
   */
  getAllUsers (req, res, next) {
    try {
      res.json({ msg: 'All users', res: this.usersData })
    } catch (err) {
      next(createError(500))
    }
  }

  /**
   * Returns top matching users.
   *
   * @param {object} req - Request object.
   * @param {object} res - Response object.
   * @param {Function} next - Next function.
   */
  getTopMatchingUsers (req, res, next) {
    try {
      const { userId, similarity, results } = req.query

      const similarUsersList = this.similarUsersAlgorithm(parseInt(userId))

      res.json({ user: userId, similarity, results, data: similarUsersList.slice(0, results) })
    } catch (err) {
      next(createError(500))
    }
  }

  /**
   * Creates an array of objects containing other users data and their similarity score.
   *
   * @param {number} selectedUserId - User to be ignored.
   * @returns {Array} - An array of user similarity scores.
   */
  similarUsersAlgorithm (selectedUserId) {
    const similarityObjects = []
    for (let i = 0; i < this.users.length; i++) {
      if (parseInt(this.users[i].userId) === selectedUserId) {
        continue
      } else {
        const similarity = this.euclideanDistance(this.users[selectedUserId - 1], this.users[i])

        const similarityObject = {
          name: this.users[i].userName,
          userId: this.users[i].userId,
          similarity
        }
        similarityObjects.push(similarityObject)
      }
    }

    const sorted = similarityObjects.sort((a, b) => {
      if (a.similarity === b.similarity) {
        return 0
      } else if (a.similarity > b.similarity) {
        return 1
      } else {
        return -1
      }
    }).reverse() // Reverse to get highest similarity first

    return sorted
  }

  /**
   * Algorithm used to calculate euclidean distance score.
   *
   * @param {object} userA - A user to be compared.
   * @param {object} userB - A user to be compared.
   * @returns {number} - euclidean distance score.
   */
  euclideanDistance = (userA, userB) => {
    let similarity = 0
    let numOfMatchingMovies = 0

    for (let a = 0; a < userA.ratings.length; a++) { // Iterate all user a ratings
      for (let b = 0; b < userB.ratings.length; b++) { // iterate all user b ratings
        if (userA.ratings[a].movieId === userB.ratings[b].movieId) {
          similarity += (userA.ratings[a].score - userB.ratings[b].score) ** 2
          numOfMatchingMovies += 1
        }
      }
    }

    if (numOfMatchingMovies === 0) { // = No matching ratings
      return 0
    }

    // Similarity score
    const inv = 1 / (1 + similarity)
    return inv.toFixed(2)
  }

  /**
   * Returns recommended movies.
   *
   * @param {object} req - Request object.
   * @param {object} res - Response object.
   * @param {Function} next - Next function.
   */
  recommendedMovies (req, res, next) {
    try {
      const { userId, similarity, results } = req.query

      const similarUsersList = this.similarUsersAlgorithm(parseInt(userId))
      const recommendedMovies = this.getMovieWeightedScores(similarUsersList, userId)
      const slicedResult = recommendedMovies.slice(0, results) // Only requested amount of movies

      const response = []
      for (let i = 0; i < slicedResult.length; i++) {
        const movieData = {
          movie: this.moviesData[slicedResult[i].movieId - 1].Title,
          movieId: slicedResult[i].movieId,
          score: slicedResult[i].score.toFixed(2)
        }
        response.push(movieData)
      }

      res.json({ user: userId, similarity, results, data: response })
    } catch (err) {
      next(createError(500))
    }
  }

  /**
   * Calculates all weighted movie scores.
   *
   * @param {Array} similarityScores - Array with userdata and similarity scores.
   * @param {number} userToIgnore - User id of the selected user.
   * @returns {Array} - Array of movie data objects (scores and sums).
   */
  getMovieWeightedScores (similarityScores, userToIgnore) {
    const moviesToReturn = []

    for (let m = 0; m < this.moviesData.length; m++) {
      // Check if selected user (in GUI) has seen the movie, if true ignore movie
      const findMovieInSelectedUser = this.users[userToIgnore - 1].ratings.filter(movie => movie.movieId === this.moviesData[m].MovieId)
      if (findMovieInSelectedUser.length !== 0) {
        continue
      }

      const allWeightedScoresForMovie = []
      const matchingUserSimilarityScores = [] // used to calculate similarity sum for movie
      for (let u = 0; u < this.users.length; u++) {
        if (this.users[u].userId === userToIgnore) { // Ignores if selected user (in GUI)
          continue
        }

        const movie = this.users[u].ratings.filter(movie => movie.movieId === this.moviesData[m].MovieId)

        if (movie.length === 1) { // User has seen the movie
          const similarityScoreComparedToSelectedUser = similarityScores.filter(simScore => simScore.userId === this.users[u].userId)
          const weightedScore = movie[0].score * similarityScoreComparedToSelectedUser[0].similarity // Always movie[0] because MovieId is unique!
          allWeightedScoresForMovie.push(parseFloat(weightedScore.toFixed(2)))
          matchingUserSimilarityScores.push(parseFloat(similarityScoreComparedToSelectedUser[0].similarity)) // Add user similarity score because it has seen the movie.
        }
      }

      // Calculate weighted score sum
      let movieWeightedScoreSum = 0
      for (let s = 0; s < allWeightedScoresForMovie.length; s++) {
        movieWeightedScoreSum += allWeightedScoresForMovie[s]
      }

      // Calculate similarity score sum
      let movieSimilarityScoreSum = 0
      for (let s = 0; s < matchingUserSimilarityScores.length; s++) {
        movieSimilarityScoreSum += matchingUserSimilarityScores[s]
      }

      // Movie result data
      const movieData = {
        movieId: this.moviesData[m].MovieId,
        weightedScoreSum: movieWeightedScoreSum,
        similarityScoreSum: movieSimilarityScoreSum
      }

      moviesToReturn.push(movieData)
    }

    // Calculate movie score
    for (let i = 0; i < moviesToReturn.length; i++) {
      const score = moviesToReturn[i].weightedScoreSum / moviesToReturn[i].similarityScoreSum
      moviesToReturn[i].score = score // Add score to movieData object
    }

    // Sort movies based on score value
    const result = moviesToReturn.sort((a, b) => {
      if (a.score === b.score) {
        return 0
      } else if (a.score > b.score) {
        return 1
      } else {
        return -1
      }
    }).reverse() // Reverse to get highest similarity first
    return result
  }
}
