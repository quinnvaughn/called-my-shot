import { builder } from "./builder"
import "./types/errors"
import "./types/user"
import "./types/auth"
import "./types/group"

builder.queryType({})

export const schema = builder.toSchema()
